import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App, TFile } from 'obsidian';
import moment from 'moment';
// 🌟 ⭐ 新增：导入历法库 ⭐ 🌟
// 请确保你运行了 `npm install lunar-javascript`
import { Solar, Lunar } from 'lunar-javascript';

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

interface ActionConfig { name: string; folder: string; template: string; }
interface DashboardSettings { openOnStartup: boolean; actions: ActionConfig[]; }

const DEFAULT_SETTINGS: DashboardSettings = {
    openOnStartup: false,
    actions: [
        { name: '新建日记', folder: '日记/{{YYYY}}/{{MM}}', template: "---\ntype: diary\ndate: {{DATE}}\n---\n\n# {{TITLE}}\n\n" },
        { name: '沉淀知识', folder: '知识库/{{YYYY}}', template: "---\ntype: knowledge\ndate: {{DATE}}\n---\n\n# {{TITLE}}\n\n" },
        { name: '灵感碎片', folder: '灵感捕捉', template: "---\ntype: idea\ndate: {{DATE}}\n---\n\n" }
    ]
}

export default class DashboardPlugin extends Plugin {
    settings: DashboardSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
        this.addRibbonIcon('layout-dashboard', '控制中心', () => this.activateView());
        this.addCommand({ id: 'show-dashboard', name: '显示控制中心', callback: () => this.activateView() });
        this.addSettingTab(new DashboardSettingTab(this.app, this));

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.openOnStartup) this.activateView();
        });
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { 
        await this.saveData(this.settings); 
        this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD).forEach(leaf => {
            if (leaf.view instanceof DashboardView) leaf.view.renderActionsInMenu(); // 如果菜单刷新，重新渲染
        });
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];
        if (!leaf) {
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
        }
        workspace.revealLeaf(leaf);
    }
}

class DashboardView extends ItemView {
    plugin: DashboardPlugin;
    boardArea: HTMLElement;
    currentMonth: moment.Moment;
    
    viewType: 'calendar' | 'heatmap' = 'calendar';
    fileDataMap: Record<string, TFile[]> = {}; 
    
    // 动画列表容器
    listWrapper: HTMLElement;
    listScrollArea: HTMLElement;
    listHeader: HTMLElement;

    // 下拉菜单容器
    plusMenu: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentMonth = moment().startOf('month');
    }

    getViewType() { return VIEW_TYPE_DASHBOARD; }
    getDisplayText() { return "控制中心"; }
    getIcon() { return "layout-dashboard"; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('dashboard-container');
        moment.locale(window.localStorage.getItem('language') || 'zh-cn');

        this.buildFileDataMap();

        // ⭐ 1. 🌟 顶栏排版 (统一悬浮 "+" 按钮) 🌟 ⭐
        const headerRow = container.createDiv({ cls: 'dashboard-header-row' });
        
        const header = headerRow.createDiv({ cls: 'baseline-header' });
        header.createDiv({ text: moment().format('M月D日 dddd'), cls: 'baseline-date' });
        header.createEl('h1', { text: '控制中心', cls: 'baseline-title' });

        const plusBtn = headerRow.createEl('button', { text: '+', cls: 'floating-plus-btn' });
        // 下拉菜单
        this.plusMenu = headerRow.createDiv({ cls: 'plus-dropdown' });
        this.renderActionsInMenu();

        // 绑定下拉菜单逻辑
        plusBtn.onclick = (e) => {
            e.stopPropagation(); // 阻止事件冒泡到 document
            this.plusMenu.toggleClass('is-open', true);
        };
        
        // 点击页面其他地方收起菜单
        document.addEventListener('click', () => {
            this.plusMenu.removeClass('is-open');
        });

        // 🌟 核心优化：彻底移除以前的动作卡片区域 🌟

        // 2. 数据看板区
        const dataSection = container.createDiv({ cls: 'dashboard-data-section' });
        
        const chartHeader = dataSection.createDiv({ cls: 'chart-header-row' });
        chartHeader.createEl('span', { text: '足迹回顾', cls: 'chart-title' });
        
        const toggleBtn = chartHeader.createEl('button', { text: '切换数据 ◓', cls: 'view-toggle-btn' });
        toggleBtn.onclick = () => {
            this.viewType = this.viewType === 'calendar' ? 'heatmap' : 'calendar';
            this.renderBoard();
        };

        this.boardArea = dataSection.createDiv({ cls: 'heatmap-calendar-wrapper' });

        this.listWrapper = dataSection.createDiv({ cls: 'record-list-wrapper' });
        this.listHeader = this.listWrapper.createDiv({ cls: 'record-list-header' });
        this.listScrollArea = this.listWrapper.createDiv({ cls: 'record-list-scroll' });

        this.renderBoard();
    }

    // ⭐ 新增：在下拉菜单里渲染动作 ⭐
    renderActionsInMenu() {
        this.plusMenu.empty();
        this.plugin.settings.actions.forEach(action => {
            if (!action.name) return;
            const item = this.plusMenu.createDiv({ cls: 'dropdown-item', text: action.name });
            item.onclick = () => {
                this.plusMenu.removeClass('is-open');
                this.promptNewNote(action);
            };
        });
    }

    // 彻底告别以前的卡片渲染
    buildFileDataMap() {
        this.fileDataMap = {};
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const dateStr = cache?.frontmatter?.date || moment(file.stat.ctime).format('YYYY-MM-DD');
            const formatKey = moment(dateStr).format('YYYY-MM-DD');
            
            if (!this.fileDataMap[formatKey]) this.fileDataMap[formatKey] = [];
            this.fileDataMap[formatKey].push(file);
        });
        for (const key in this.fileDataMap) { this.fileDataMap[key].sort((a, b) => b.stat.ctime - a.stat.ctime); }
    }

    renderBoard() {
        this.boardArea.empty();
        this.closeListAnimation();

        if (this.viewType === 'calendar') this.renderCalendar();
        else this.renderHeatmap();
    }

    renderCalendar() {
        this.closeListAnimation(); // 收起文件列表

        const year = this.currentMonth.year();
        const month = this.currentMonth.month();
        const firstDay = moment([year, month, 1]).day();

        // 🌟 苹果原生风格导航 (无边框，按下有动画) 🌟
        const nav = this.boardArea.createDiv({ cls: 'calendar-nav' });
        nav.createEl('button', { text: '‹', cls: 'month-nav-btn' }).onclick = () => { this.currentMonth.subtract(1, 'M'); this.renderBoard(); };
        nav.createSpan({ text: this.currentMonth.format('YYYY.MM'), cls: 'month-label' });
        nav.createEl('button', { text: '›', cls: 'month-nav-btn' }).onclick = () => { this.currentMonth.add(1, 'M'); this.renderBoard(); };

        const weekdaysGrid = this.boardArea.createDiv({ cls: 'calendar-weekdays' });
        ['日', '一', '二', '三', '四', '五', '六'].forEach(day => weekdaysGrid.createDiv({ text: day }));

        const grid = this.boardArea.createDiv({ cls: 'calendar-grid' });
        for (let i = 0; i < firstDay; i++) grid.createDiv({ cls: 'calendar-cell empty' });

        for (let day = 1; day <= this.currentMonth.daysInMonth(); day++) {
            const dateKey = moment([year, month, day]).format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ cls: 'calendar-cell' });
            // cell.title = `${dateKey}: ${count} 篇内容`; // Notion 风格不加 title

            // 🌟 ⭐ 新增：计算历法并填充双行数字底下 ⭐ 🌟
            // 将 moment 的 Gregorian 日期转换为 Solar，Solar 转换为 Lunar
            // moment 的月是 0-11
            const solarDay = Solar.fromYmd(year, month + 1, day);
            const lunarDay = Lunar.fromSolar(solarDay);
            
            // 获取天干地支日 (地支日更常用作日期标识，地支12循环)
            // 你说“天干地支纪年法”底下，我这里用更细化的“地支日”
            // lunarDay.getInXian() 或者初一显示月份
            const lunarText = lunarDay.getDay() === 1 ? lunarDay.getMonthInChinese() + '月' : lunarDay.getDayInChinese();
            const cyclicalDay = lunarDay.getDayGanZhi(); // 天干地支日：甲子日

            // 双行排版：公历大字，中国小字（地支日）
            cell.createDiv({ text: day.toString(), cls: 'cal-date-num' });
            // 这里用 DayInChinese (初一) 或者 GanZhi (甲子)，GanZhi更贴合你的要求
            cell.createDiv({ text: lunarText, cls: 'cal-lunar-text' });

            if (count > 0) {
                cell.addClass('has-data');
                cell.addClass(`level-${Math.min(Math.ceil(count / 2), 4)}`);
            } else {
                cell.addClass('level-0');
            }

            cell.onclick = () => {
                grid.findAll('.calendar-cell').forEach(el => el.removeClass('active-selection'));
                cell.addClass('active-selection');
                this.triggerListAnimation(dateKey, files);
            };
        }
    }

    renderHeatmap() {
        this.closeListAnimation(); 
        const grid = this.boardArea.createDiv({ cls: 'heatmap-grid' });
        for (let i = 83; i >= 0; i--) {
            const dateKey = moment().subtract(i, 'days').format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ cls: 'heatmap-cell' });
            if (count > 0) cell.addClass(`level-${Math.min(Math.ceil(count / 2), 4)}`);
            
            cell.onclick = () => {
                grid.findAll('.heatmap-cell').forEach(el => el.removeClass('active-selection'));
                cell.addClass('active-selection');
                this.triggerListAnimation(dateKey, files);
            };
        }
        const labels = this.boardArea.createDiv({ cls: 'calendar-nav' });
        labels.createSpan({ text: '12周前', cls: 'calendar-header-cell' });
        labels.createSpan({ text: '今天', cls: 'calendar-header-cell' });
    }

    triggerListAnimation(dateStr: string, files: TFile[]) {
        this.listScrollArea.empty();
        if (files.length === 0) { this.listHeader.innerText = `${dateStr} 没有记录`; this.listWrapper.addClass('is-open'); return; }
        this.listHeader.innerText = `${dateStr} 的记录 (${files.length})`;
        
        files.forEach(file => {
            const item = this.listScrollArea.createDiv({ cls: 'record-item' });
            item.createDiv({ text: '📄', cls: 'record-icon' });
            item.createDiv({ text: file.basename, cls: 'record-title' });
            item.onclick = async () => { await this.app.workspace.getLeaf(true).openFile(file); };
        });
        this.listWrapper.addClass('is-open');
    }

    closeListAnimation() { this.listWrapper.removeClass('is-open'); }

    // --- 新建笔记相关 ---
    async promptNewNote(config: ActionConfig) {
        new QuickNoteModal(this.app, async (title, date) => {
            const parsedFolder = config.folder.replace(/\{\{YYYY\}\}/g, moment(date).format('YYYY')).replace(/\{\{MM\}\}/g, moment(date).format('MM'));
            const parsedContent = config.template.replace(/\{\{DATE\}\}/g, date).replace(/\{\{TITLE\}\}/g, title);
            await this.ensureFolder(parsedFolder);
            const fileName = `${parsedFolder}/${title}.md`;
            try {
                const file = await this.app.vault.create(fileName, parsedContent);
                await this.app.workspace.getLeaf(true).openFile(file);
            } catch (e) { console.error("创建失败", e); }
        }).open();
    }

    async ensureFolder(path: string) {
        const folders = path.split('/');
        let currentPath = "";
        for (const folder of folders) {
            currentPath += (currentPath === "" ? "" : "/") + folder;
            if (!(this.app.vault.getAbstractFileByPath(currentPath) instanceof TFolder)) await this.app.vault.createFolder(currentPath);
        }
    }
}

class QuickNoteModal extends Modal {
    title: string = ""; date: string = moment().format('YYYY-MM-DD');
    onSubmit: (title: string, date: string) => void;
    constructor(app: any, onSubmit: (title: string, date: string) => void) { super(app); this.onSubmit = onSubmit; this.title = `${moment().format('MMDD')}-`; }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: `记录新内容` });
        new Setting(contentEl).setName('标题').addText(text => { text.setValue(this.title); text.onChange(value => this.title = value); });
        new Setting(contentEl).setName('归档日期').addText(text => { text.setValue(this.date); text.onChange(value => this.date = value); });
        new Setting(contentEl).addButton(btn => btn.setButtonText('确认创建').setCta().onClick(() => { if (!this.title) return; this.close(); this.onSubmit(this.title, this.date); }));
    }
}

class DashboardSettingTab extends PluginSettingTab {
    plugin: DashboardPlugin;
    constructor(app: App, plugin: DashboardPlugin) { super(app, plugin); this.plugin = plugin; }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '控制中心设置' });
        new Setting(containerEl).setName('启动时自动打开').addToggle(toggle => toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (val) => { this.plugin.settings.openOnStartup = val; await this.plugin.saveSettings(); }));
        containerEl.createEl('h3', { text: '新建类型管理' });
        this.plugin.settings.actions.forEach((action, index) => {
            containerEl.createEl('h4', { text: `类型 ${index + 1}` });
            new Setting(containerEl).setName('名称 (留空隐藏)').addText(text => text.setValue(action.name).onChange(async (val) => { action.name = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('保存文件夹').addText(text => text.setValue(action.folder).onChange(async (val) => { action.folder = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('默认模板').addTextArea(text => { text.setValue(action.template).onChange(async (val) => { action.template = val; await this.plugin.saveSettings(); }); text.inputEl.rows = 4; });
        });
    }
}
