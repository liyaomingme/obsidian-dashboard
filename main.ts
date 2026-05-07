import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App, TFile } from 'obsidian';
import moment from 'moment';

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

interface ActionConfig { name: string; folder: string; template: string; }
interface DashboardSettings { openOnStartup: boolean; actions: ActionConfig[]; }

const DEFAULT_SETTINGS: DashboardSettings = {
    openOnStartup: false,
    actions: [
        { name: '新建日记', folder: '日记/{{YYYY}}/{{MM}}', template: "---\ntype: diary\ndate: {{DATE}}\n---\n\n" },
        { name: '沉淀知识', folder: '知识库/{{YYYY}}', template: "---\ntype: knowledge\ndate: {{DATE}}\n---\n\n" },
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
            if (leaf.view instanceof DashboardView) leaf.view.renderActions();
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
    actionsContainer: HTMLElement;
    boardArea: HTMLElement;
    
    currentMonth: moment.Moment;
    viewType: 'calendar' | 'heatmap' = 'calendar';
    fileDataMap: Record<string, TFile[]> = {}; 
    
    // 动画列表容器
    listWrapper: HTMLElement;
    listScrollArea: HTMLElement;
    listHeader: HTMLElement;

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

        // 1. 顶栏
        const header = container.createDiv({ cls: 'apple-header' });
        header.createDiv({ text: moment().format('M月D日 dddd'), cls: 'apple-date' });
        header.createEl('h1', { text: '控制中心', cls: 'apple-title' });

        // 2. 快捷动作区 (Bento Box)
        this.actionsContainer = container.createDiv({ cls: 'dashboard-actions' });
        this.renderActions();

        // 3. 数据看板区 (包含日历/热力图 + 隐藏的详情列表)
        const boardPanel = container.createDiv({ cls: 'glass-panel board-panel' });
        
        const boardHeader = boardPanel.createDiv({ cls: 'board-header' });
        boardHeader.createEl('h3', { text: '足迹回顾', cls: 'board-title' });
        const toggleBtn = boardHeader.createEl('button', { text: '切换视图 ◓', cls: 'view-toggle-btn' });
        toggleBtn.onclick = () => {
            this.viewType = this.viewType === 'calendar' ? 'heatmap' : 'calendar';
            this.renderBoard();
        };

        this.boardArea = boardPanel.createDiv();

        // 🌟 4. 苹果丝滑动画列表容器 (初始状态隐藏) 🌟
        this.listWrapper = boardPanel.createDiv({ cls: 'record-list-wrapper' });
        this.listHeader = this.listWrapper.createDiv({ cls: 'record-list-header' });
        this.listScrollArea = this.listWrapper.createDiv({ cls: 'record-list-scroll' });

        this.renderBoard();
    }

    renderActions() {
        this.actionsContainer.empty();
        this.plugin.settings.actions.forEach(action => {
            if (!action.name) return;
            const card = this.actionsContainer.createDiv({ cls: 'glass-panel action-card' });
            card.createDiv({ text: action.name, cls: 'action-title' });
            card.onclick = () => this.promptNewNote(action);
        });
    }

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
        // 按文件创建时间或修改时间降序排序
        for (const key in this.fileDataMap) {
            this.fileDataMap[key].sort((a, b) => b.stat.ctime - a.stat.ctime);
        }
    }

    renderBoard() {
        this.boardArea.empty();
        this.closeListAnimation(); // 切换视图时收起列表

        if (this.viewType === 'calendar') this.renderCalendar();
        else this.renderHeatmap();
    }

    renderCalendar() {
        const year = this.currentMonth.year();
        const month = this.currentMonth.month();
        const firstDay = moment([year, month, 1]).day();

        const nav = this.boardArea.createDiv({ cls: 'calendar-nav' });
        nav.createEl('button', { text: '‹', cls: 'cal-nav-btn' }).onclick = () => { this.currentMonth.subtract(1, 'M'); this.renderBoard(); };
        nav.createSpan({ text: this.currentMonth.format('YYYY年 M月'), cls: 'cal-month-label' });
        nav.createEl('button', { text: '›', cls: 'cal-nav-btn' }).onclick = () => { this.currentMonth.add(1, 'M'); this.renderBoard(); };

        const grid = this.boardArea.createDiv({ cls: 'calendar-grid' });
        ['日', '一', '二', '三', '四', '五', '六'].forEach(d => grid.createDiv({ text: d, cls: 'calendar-header-cell' }));

        for (let i = 0; i < firstDay; i++) grid.createDiv({ cls: 'calendar-cell empty' });

        for (let day = 1; day <= this.currentMonth.daysInMonth(); day++) {
            const dateKey = moment([year, month, day]).format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ text: day.toString(), cls: 'calendar-cell' });
            
            if (count > 0) {
                cell.addClass('has-data');
                cell.addClass(`level-${Math.min(Math.ceil(count / 2), 4)}`);
            }

            // 绑定点击事件
            cell.onclick = () => {
                grid.findAll('.calendar-cell').forEach(el => el.removeClass('active-selection'));
                cell.addClass('active-selection');
                this.triggerListAnimation(dateKey, files);
            };
        }
    }

    renderHeatmap() {
        const grid = this.boardArea.createDiv({ cls: 'heatmap-grid' });
        for (let i = 83; i >= 0; i--) {
            const dateKey = moment().subtract(i, 'days').format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ cls: 'heatmap-cell' });
            if (count > 0) cell.addClass(`level-${Math.min(Math.ceil(count / 2), 4)}`);
            cell.addClass('has-data');

            cell.onclick = () => {
                grid.findAll('.heatmap-cell').forEach(el => el.removeClass('active-selection'));
                cell.addClass('active-selection');
                this.triggerListAnimation(dateKey, files);
            };
        }
        const labels = this.boardArea.createDiv({ cls: 'calendar-nav' }); // 复用一点排版
        labels.createSpan({ text: '12周前', cls: 'calendar-header-cell' });
        labels.createSpan({ text: '今天', cls: 'calendar-header-cell' });
    }

    // 🌟 触发丝滑的展开动画 🌟
    triggerListAnimation(dateStr: string, files: TFile[]) {
        this.listScrollArea.empty();
        
        if (files.length === 0) {
            this.listHeader.innerText = `${dateStr} 没有留下记录`;
            this.listWrapper.addClass('is-open');
            return;
        }

        this.listHeader.innerText = `${dateStr} 的记录 (${files.length})`;
        
        files.forEach(file => {
            const item = this.listScrollArea.createDiv({ cls: 'record-item' });
            item.createDiv({ text: '📄', cls: 'record-icon' });
            item.createDiv({ text: file.basename, cls: 'record-title' });
            
            // 🌟 关键修复：确保在不覆盖主页的情况下打开文件 🌟
            item.onclick = async () => {
                // getLeaf(true) 会在新的标签页中打开文件，完美适配移动端和桌面端，且不破坏主页
                const leaf = this.app.workspace.getLeaf(true);
                await leaf.openFile(file);
            };
        });

        // 赋予 CSS 展开类名
        this.listWrapper.addClass('is-open');
    }

    closeListAnimation() {
        this.listWrapper.removeClass('is-open');
    }

    // --- 新建笔记相关 ---
    async promptNewNote(config: ActionConfig) {
        new QuickNoteModal(this.app, async (title, date) => {
            const parsedFolder = config.folder.replace(/\{\{YYYY\}\}/g, moment(date).format('YYYY')).replace(/\{\{MM\}\}/g, moment(date).format('MM'));
            const parsedContent = config.template.replace(/\{\{DATE\}\}/g, date).replace(/\{\{TITLE\}\}/g, title);
            await this.ensureFolder(parsedFolder);
            const fileName = `${parsedFolder}/${title}.md`;
            try {
                const file = await this.app.vault.create(fileName, parsedContent);
                // 新建后直接在新标签页打开
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
    constructor(app: any, onSubmit: (title: string, date: string) => void) {
        super(app); this.onSubmit = onSubmit; this.title = `${moment().format('MMDD')}-`;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: `新建内容` });
        new Setting(contentEl).setName('标题').addText(text => { text.setValue(this.title); text.onChange(value => this.title = value); });
        new Setting(contentEl).setName('归档日期').addText(text => { text.setValue(this.date); text.onChange(value => this.date = value); });
        new Setting(contentEl).addButton(btn => btn.setButtonText('确认创建').setCta().onClick(() => {
            if (!this.title) return; this.close(); this.onSubmit(this.title, this.date);
        }));
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
        containerEl.createEl('h3', { text: '快捷卡片管理' });
        this.plugin.settings.actions.forEach((action, index) => {
            containerEl.createEl('h4', { text: `卡片 ${index + 1}` });
            new Setting(containerEl).setName('名称 (留空隐藏)').addText(text => text.setValue(action.name).onChange(async (val) => { action.name = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('保存文件夹').addText(text => text.setValue(action.folder).onChange(async (val) => { action.folder = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('默认模板').addTextArea(text => { text.setValue(action.template).onChange(async (val) => { action.template = val; await this.plugin.saveSettings(); }); text.inputEl.rows = 4; });
        });
    }
}
