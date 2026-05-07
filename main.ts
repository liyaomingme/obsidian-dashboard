import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App, TFile } from 'obsidian';
import moment from 'moment';

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

interface ActionConfig { name: string; folder: string; template: string; }
interface DashboardSettings { openOnStartup: boolean; actions: ActionConfig[]; }

const DEFAULT_SETTINGS: DashboardSettings = {
    openOnStartup: false,
    actions: [
        { name: '新建文档', folder: '笔记/{{YYYY}}', template: "---\ndate: {{DATE}}\n---\n\n# {{TITLE}}\n\n" },
        { name: '快速记录', folder: '日记/{{YYYY}}/{{MM}}', template: "---\ntype: diary\ndate: {{DATE}}\n---\n\n" }
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
    async saveSettings() { await this.saveData(this.settings); }

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
    listArea: HTMLElement;
    
    currentMonth: moment.Moment;
    viewType: 'calendar' | 'heatmap' = 'calendar';
    fileDataMap: Record<string, TFile[]> = {}; // 核心：日期 -> 文件列表的映射

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

        // 预处理所有文件数据
        this.buildFileDataMap();

        // 1. 顶栏
        const header = container.createDiv({ cls: 'notion-header' });
        header.createSpan({ text: moment().format('M月D日 dddd').toUpperCase(), cls: 'notion-date' });
        header.createEl('h1', { text: '控制中心', cls: 'notion-title' });

        // 2. 快捷动作区 (横向滑动)
        const actionsScroll = container.createDiv({ cls: 'notion-actions-scroll' });
        this.plugin.settings.actions.forEach(action => {
            if (!action.name) return;
            const card = actionsScroll.createDiv({ cls: 'notion-action-card' });
            card.createDiv({ text: '📄', cls: 'notion-action-icon' });
            card.createDiv({ text: action.name, cls: 'notion-action-text' });
            card.onclick = () => this.promptNewNote(action);
        });

        // 3. 视图头部
        const sectionHeader = container.createDiv({ cls: 'section-header' });
        sectionHeader.createEl('h3', { text: '足迹回顾', cls: 'section-title' });
        const toggleBtn = sectionHeader.createEl('button', { text: '切换视图', cls: 'notion-toggle-btn' });
        toggleBtn.onclick = () => {
            this.viewType = this.viewType === 'calendar' ? 'heatmap' : 'calendar';
            this.renderBoard();
        };

        // 4. 看板区 & 列表区
        this.boardArea = container.createDiv({ cls: 'notion-board' });
        this.listArea = container.createDiv({ cls: 'notion-list-section' });
        this.listArea.hide(); // 默认隐藏列表

        this.renderBoard();
    }

    // 核心逻辑：扫描仓库，建立日期和文件的对应关系
    buildFileDataMap() {
        this.fileDataMap = {};
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const dateStr = cache?.frontmatter?.date || moment(file.stat.ctime).format('YYYY-MM-DD');
            const formatKey = moment(dateStr).format('YYYY-MM-DD');
            
            if (!this.fileDataMap[formatKey]) {
                this.fileDataMap[formatKey] = [];
            }
            this.fileDataMap[formatKey].push(file);
        });
    }

    renderBoard() {
        this.boardArea.empty();
        this.listArea.hide();

        if (this.viewType === 'calendar') {
            this.renderCalendar();
        } else {
            this.renderHeatmap();
        }
    }

    renderCalendar() {
        const year = this.currentMonth.year();
        const month = this.currentMonth.month();
        const daysInMonth = this.currentMonth.daysInMonth();
        const firstDay = moment([year, month, 1]).day();

        // 导航
        const nav = this.boardArea.createDiv({ cls: 'calendar-nav' });
        nav.createEl('button', { text: '<', cls: 'calendar-nav-btn' }).onclick = () => { this.currentMonth.subtract(1, 'M'); this.renderBoard(); };
        nav.createSpan({ text: this.currentMonth.format('YYYY年 M月'), cls: 'calendar-title' });
        nav.createEl('button', { text: '>', cls: 'calendar-nav-btn' }).onclick = () => { this.currentMonth.add(1, 'M'); this.renderBoard(); };

        const grid = this.boardArea.createDiv({ cls: 'calendar-grid' });
        ['日', '一', '二', '三', '四', '五', '六'].forEach(d => grid.createDiv({ text: d, cls: 'calendar-header' }));

        for (let i = 0; i < firstDay; i++) grid.createDiv({ cls: 'calendar-cell empty' });

        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = moment([year, month, day]).format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ text: day.toString(), cls: 'calendar-cell' });
            
            if (count > 0) {
                cell.addClass('has-data');
                const level = Math.min(Math.ceil(count / 2), 4); // 简单分级
                cell.addClass(`level-${level}`);
            } else {
                cell.addClass('level-0');
            }

            // ⭐ 点击单元格展示当天的笔记列表
            cell.onclick = () => {
                // 移除其他选中状态
                grid.findAll('.calendar-cell').forEach(el => el.removeClass('active'));
                cell.addClass('active');
                this.showFileList(dateKey, files);
            };
        }
    }

    renderHeatmap() {
        const wrapper = this.boardArea.createDiv({ cls: 'heatmap-wrapper' });
        const grid = wrapper.createDiv({ cls: 'heatmap-grid' });
        const daysToTrack = 84; // 12 周

        for (let i = daysToTrack - 1; i >= 0; i--) {
            const dateKey = moment().subtract(i, 'days').format('YYYY-MM-DD');
            const files = this.fileDataMap[dateKey] || [];
            const count = files.length;

            const cell = grid.createDiv({ cls: 'heatmap-cell' });
            cell.title = `${dateKey}: ${count} 篇`;

            if (count > 0) {
                const level = Math.min(Math.ceil(count / 2), 4);
                cell.addClass(`level-${level}`);
            }

            // ⭐ 点击热力图单元格同样展示列表
            cell.onclick = () => {
                grid.findAll('.heatmap-cell').forEach(el => el.removeClass('active'));
                cell.addClass('active');
                this.showFileList(dateKey, files);
            };
        }

        const labels = wrapper.createDiv({ cls: 'heatmap-labels' });
        labels.createSpan({ text: '12周前' });
        labels.createSpan({ text: '今天' });
    }

    // ⭐ 核心渲染：像 Notion 一样的文件列表
    showFileList(dateStr: string, files: TFile[]) {
        this.listArea.empty();
        this.listArea.show();

        this.listArea.createDiv({ text: `📝 ${dateStr} 的记录`, cls: 'notion-list-title' });

        if (files.length === 0) {
            this.listArea.createDiv({ text: '这一天没有任何记录。', cls: 'notion-list-name' }).style.color = 'var(--text-muted)';
            return;
        }

        files.forEach(file => {
            const item = this.listArea.createDiv({ cls: 'notion-list-item' });
            item.createDiv({ text: '📄', cls: 'notion-list-icon' });
            item.createDiv({ text: file.basename, cls: 'notion-list-name' });
            
            // 点击直接在 Obsidian 中打开该文件
            item.onclick = async () => {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
            };
        });
    }

    // --- 新建笔记相关 ---
    async promptNewNote(config: ActionConfig) {
        new QuickNoteModal(this.app, config.name, async (title, date) => {
            const parsedFolder = config.folder.replace(/\{\{YYYY\}\}/g, moment(date).format('YYYY')).replace(/\{\{MM\}\}/g, moment(date).format('MM'));
            const parsedContent = config.template.replace(/\{\{DATE\}\}/g, date).replace(/\{\{TITLE\}\}/g, title);
            await this.ensureFolder(parsedFolder);
            const fileName = `${parsedFolder}/${title}.md`;
            try {
                const file = await this.app.vault.create(fileName, parsedContent);
                await this.app.workspace.getLeaf(false).openFile(file);
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
    constructor(app: any, titlePrefix: string, onSubmit: (title: string, date: string) => void) {
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
