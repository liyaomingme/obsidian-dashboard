import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App, TFile } from 'obsidian';
import moment from 'moment';
import { Lunar } from 'lunar-javascript';

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

interface ActionConfig { name: string; folder: string; template: string; }
interface DashboardSettings { openOnStartup: boolean; actions: ActionConfig[]; }

const DEFAULT_SETTINGS: DashboardSettings = {
    openOnStartup: false,
    actions: [
        { name: '新建日记', folder: '日记/{{YYYY}}/{{MM}}', template: "---\ntype: diary\ndate: {{DATE}}\nbazi: {{BAZI}}\n---\n\n" },
        { name: '沉淀知识', folder: '知识库/{{YYYY}}', template: "---\ntype: knowledge\ndate: {{DATE}}\nbazi: {{BAZI}}\n---\n\n" },
        { name: '灵感碎片', folder: '灵感捕捉', template: "---\ntype: idea\ndate: {{DATE}}\nbazi: {{BAZI}}\n---\n\n" }
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
            if (this.settings.openOnStartup) {
                const emptyLeaves = this.app.workspace.getLeavesOfType("empty");
                if (emptyLeaves.length > 0) {
                    emptyLeaves[0].setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
                } else {
                    this.activateView();
                }
            }
        });
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { 
        await this.saveData(this.settings); 
        this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD).forEach(leaf => {
            if (leaf.view instanceof DashboardView) leaf.view.renderActionsInMenu(); 
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
    
    fileDataMap: Record<string, TFile[]> = {}; 
    listWrapper: HTMLElement;
    listScrollArea: HTMLElement;
    listHeader: HTMLElement;
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

        const headerRow = container.createDiv({ cls: 'dashboard-header-row' });
        const header = headerRow.createDiv({ cls: 'baseline-header' });
        
        header.createDiv({ text: moment().format('M月D日 dddd'), cls: 'baseline-date' });

        const now = new Date();
        const lunarNow = Lunar.fromDate(now);
        const baziNowStr = `${lunarNow.getYearInGanZhi()}年 · ${lunarNow.getMonthInGanZhi()}月 · ${lunarNow.getDayInGanZhi()}日 · ${lunarNow.getTimeInGanZhi()}时`;
        header.createEl('h1', { text: baziNowStr, cls: 'baseline-title bazi-title' });

        const plusBtn = headerRow.createEl('span', { text: '+', cls: 'floating-plus-btn' });
        this.plusMenu = headerRow.createDiv({ cls: 'plus-dropdown' });
        this.renderActionsInMenu();

        plusBtn.onclick = (e) => {
            e.stopPropagation();
            this.plusMenu.toggleClass('is-open', !this.plusMenu.hasClass('is-open'));
        };
        document.addEventListener('click', () => { if(this.plusMenu) this.plusMenu.removeClass('is-open'); });

        const dataSection = container.createDiv({ cls: 'dashboard-data-section' });
        
        const chartHeader = dataSection.createDiv({ cls: 'chart-header-row' });
        chartHeader.createEl('span', { text: '足迹回顾', cls: 'chart-title' });

        this.boardArea = dataSection.createDiv({ cls: 'heatmap-calendar-wrapper' });
        this.listWrapper = dataSection.createDiv({ cls: 'record-list-wrapper' });
        this.listHeader = this.listWrapper.createDiv({ cls: 'record-list-header' });
        this.listScrollArea = this.listWrapper.createDiv({ cls: 'record-list-scroll' });

        this.renderCalendar('none');
    }

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

    renderCalendar(direction: 'left' | 'right' | 'none' = 'none') {
        this.boardArea.empty();
        this.closeListAnimation();

        const year = this.currentMonth.year();
        const month = this.currentMonth.month();
        const firstDay = moment([year, month, 1]).day();

        const nav = this.boardArea.createDiv({ cls: 'month-nav' });
        
        nav.createEl('span', { text: '‹', cls: 'month-nav-btn back-arrow' }).onclick = () => { this.currentMonth.subtract(1, 'M'); this.renderCalendar('left'); };
        nav.createSpan({ text: this.currentMonth.format('YYYY年 M月'), cls: 'month-label' });
        nav.createEl('span', { text: '›', cls: 'month-nav-btn next-arrow' }).onclick = () => { this.currentMonth.add(1, 'M'); this.renderCalendar('right'); };

        const animWrapper = this.boardArea.createDiv({ cls: 'calendar-anim-wrapper' });
        if (direction === 'left') animWrapper.addClass('slide-in-left');
        if (direction === 'right') animWrapper.addClass('slide-in-right');

        const weekdaysGrid = animWrapper.createDiv({ cls: 'calendar-weekdays' });
        ['日', '一', '二', '三', '四', '五', '六'].forEach(day => weekdaysGrid.createDiv({ text: day }));

        const grid = animWrapper.createDiv({ cls: 'calendar-grid' });
        for (let i = 0; i < firstDay; i++) grid.createDiv({ cls: 'calendar-cell empty' });

        for (let day = 1; day <= this.currentMonth.daysInMonth(); day++) {
            const dateKey = moment([year, month, day]).format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ cls: 'calendar-cell' });
            
            const d = new Date(year, month, day);
            const lunar = Lunar.fromDate(d);
            const lunarDayStr = lunar.getDay() === 1 ? lunar.getMonthInChinese() + '月' : lunar.getDayInChinese();
            
            cell.createDiv({ text: day.toString(), cls: 'cal-date-num' });
            cell.createDiv({ text: lunarDayStr, cls: 'cal-lunar-text' });

            if (count > 0) {
                cell.addClass('has-data');
                cell.addClass(`level-${Math.min(count, 4)}`);
            }

            cell.onclick = () => {
                grid.findAll('.calendar-cell').forEach(el => el.removeClass('active-selection'));
                cell.addClass('active-selection');
                this.triggerListAnimation(dateKey, files, lunar);
            };
        }
    }

    triggerListAnimation(dateStr: string, files: TFile[], lunar: Lunar) {
        this.listScrollArea.empty();
        
        const baziDay = `${lunar.getYearInGanZhi()}年 · ${lunar.getMonthInGanZhi()}月 · ${lunar.getDayInGanZhi()}日`;

        if (files.length === 0) { 
            this.listHeader.innerHTML = `
                <div class="record-list-date">${dateStr}</div>
                <div class="record-list-lunar">${baziDay} · 暂无足迹</div>
            `;
            this.listWrapper.addClass('is-open'); 
            return; 
        }
        
        this.listHeader.innerHTML = `
            <div class="record-list-date">${dateStr} <span class="record-list-count">${files.length} 篇</span></div>
            <div class="record-list-lunar">${baziDay}</div>
        `;
        
        files.forEach(file => {
            const item = this.listScrollArea.createDiv({ cls: 'record-item' });
            item.createDiv({ text: '📄', cls: 'record-icon' });
            item.createDiv({ text: file.basename, cls: 'record-title' });
            item.onclick = async () => { await this.app.workspace.getLeaf(true).openFile(file); };
        });
        this.listWrapper.addClass('is-open');
    }

    closeListAnimation() { this.listWrapper.removeClass('is-open'); }

    async promptNewNote(config: ActionConfig) {
        new QuickNoteModal(this.app, config, async (title, date, folderPath) => {
            const selectedDate = moment(date).toDate();
            selectedDate.setHours(new Date().getHours()); 
            const lunarFull = Lunar.fromDate(selectedDate);
            const baziFullStr = `${lunarFull.getYearInGanZhi()}年 ${lunarFull.getMonthInGanZhi()}月 ${lunarFull.getDayInGanZhi()}日 ${lunarFull.getTimeInGanZhi()}时`;

            const parsedContent = config.template
                .replace(/\{\{DATE\}\}/g, date)
                .replace(/\{\{TITLE\}\}/g, title)
                .replace(/\{\{BAZI\}\}/g, baziFullStr);

            await this.ensureFolder(folderPath);
            const fileName = `${folderPath}/${title}.md`;
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
    title: string = ""; 
    date: string = moment().format('YYYY-MM-DD');
    folderPath: string = ""; 
    actionConfig: ActionConfig;
    onSubmit: (title: string, date: string, folder: string) => void;
    
    constructor(app: any, config: ActionConfig, onSubmit: (title: string, date: string, folder: string) => void) { 
        super(app); 
        this.actionConfig = config;
        this.onSubmit = onSubmit; 
        this.title = `${moment().format('MMDD')}-`; 
        
        this.folderPath = config.folder
            .replace(/\{\{YYYY\}\}/g, moment().format('YYYY'))
            .replace(/\{\{MM\}\}/g, moment().format('MM'));
    }
    
    onOpen() {
        const { contentEl, modalEl, containerEl } = this;
        
        containerEl.addClass('ios-glass-modal-container');
        modalEl.addClass('ios-glass-modal');
        
        contentEl.createEl('h3', { text: this.actionConfig.name });
        
        new Setting(contentEl).setName('记录标题').addText(text => { text.setValue(this.title); text.onChange(value => this.title = value); });
        new Setting(contentEl).setName('归档日期').addText(text => { text.setValue(this.date); text.onChange(value => this.date = value); });
        
        const folderSetting = new Setting(contentEl).setName('保存路径 (可输入或下拉选择)').addText(text => { 
            text.setValue(this.folderPath); 
            text.onChange(value => this.folderPath = value); 
            
            const inputEl = text.inputEl;
            const settingControl = inputEl.parentElement;
            
            if(settingControl) {
                const suggestWrapper = settingControl.createDiv({ cls: 'folder-suggest-wrapper' });
                const suggestMenu = suggestWrapper.createDiv({ cls: 'folder-suggest-menu' });

                const allFolders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder && f.path !== '/') as TFolder[];

                const showSuggestions = () => {
                    suggestMenu.empty();
                    const query = inputEl.value.toLowerCase();
                    const matches = allFolders.filter(f => f.path.toLowerCase().includes(query)).slice(0, 15); 

                    if (matches.length > 0) {
                        suggestWrapper.style.maxHeight = '180px';
                        suggestWrapper.style.opacity = '1';
                        matches.forEach(folder => {
                            const item = suggestMenu.createDiv({ cls: 'suggest-item', text: folder.path });
                            item.onmousedown = (e) => { 
                                e.preventDefault();
                                inputEl.value = folder.path;
                                this.folderPath = folder.path;
                                suggestWrapper.style.maxHeight = '0';
                                suggestWrapper.style.opacity = '0';
                                inputEl.dispatchEvent(new Event('input'));
                            };
                        });
                    } else {
                        suggestWrapper.style.maxHeight = '0';
                        suggestWrapper.style.opacity = '0';
                    }
                };

                inputEl.addEventListener('input', showSuggestions);
                
                // 🌟 解决卡顿：只显示菜单，绝不强制调用 scrollIntoView 去抢夺视口 🌟
                inputEl.addEventListener('focus', () => { showSuggestions(); });
                
                inputEl.addEventListener('blur', () => { setTimeout(() => {
                    suggestWrapper.style.maxHeight = '0';
                    suggestWrapper.style.opacity = '0';
                }, 200); }); 
            }
        });
        
        new Setting(contentEl).addButton(btn => btn.setButtonText('确认创建').setCta().onClick(() => { 
            if (!this.title || !this.folderPath) return; 
            this.close(); 
            this.onSubmit(this.title, this.date, this.folderPath); 
        }));

        // 🌟 核心：一个完全静默的动态垫片。只有聚焦“文件夹”时才拉开空间，让你滑动！无滚动劫持！🌟
        const spacer = contentEl.createDiv({ cls: 'keyboard-dynamic-spacer' });
        const inputs = contentEl.findAll('input[type="text"]');
        
        // 只有最后一个（保存路径）才会触发垫片
        if(inputs.length >= 3) {
            inputs[2].addEventListener('focus', () => { spacer.style.height = '200px'; });
            inputs[2].addEventListener('blur', () => { setTimeout(() => { spacer.style.height = '0'; }, 200); });
        }
    }
}

class DashboardSettingTab extends PluginSettingTab {
    plugin: DashboardPlugin;
    constructor(app: App, plugin: DashboardPlugin) { super(app, plugin); this.plugin = plugin; }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '控制中心设置' });
        
        new Setting(containerEl).setName('设为开屏主页 (打开时启动)')
            .setDesc('每次打开 Obsidian 时，将默认的新建空白页替换为控制中心。')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (val) => { this.plugin.settings.openOnStartup = val; await this.plugin.saveSettings(); }));
        
        containerEl.createEl('h3', { text: '新建类型管理' });
        containerEl.createEl('p', { text: '支持的模板变量: {{DATE}}, {{TITLE}}, {{BAZI}} (生成: 丙午年 癸巳月 辛巳日 丙申时)', cls: 'setting-item-description' });

        this.plugin.settings.actions.forEach((action, index) => {
            containerEl.createEl('h4', { text: `类型 ${index + 1}` });
            new Setting(containerEl).setName('名称 (留空隐藏)').addText(text => text.setValue(action.name).onChange(async (val) => { action.name = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('保存文件夹').addText(text => text.setValue(action.folder).onChange(async (val) => { action.folder = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('默认模板').addTextArea(text => { text.setValue(action.template).onChange(async (val) => { action.template = val; await this.plugin.saveSettings(); }); text.inputEl.rows = 5; });
        });
    }
}
