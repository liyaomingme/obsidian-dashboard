import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App } from 'obsidian';
import moment from 'moment';

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

interface ActionConfig {
    name: string;
    folder: string;
    template: string;
}

interface DashboardSettings {
    openOnStartup: boolean;
    actions: ActionConfig[];
}

const DEFAULT_SETTINGS: DashboardSettings = {
    openOnStartup: false,
    actions: [
        { name: '日记', folder: '日记/{{YYYY}}/{{MM}}', template: "---\ntype: diary\ndate: {{DATE}}\n---\n\n# {{TITLE}}\n\n" },
        { name: '知识', folder: '知识库/{{YYYY}}', template: "---\ntype: knowledge\ndate: {{DATE}}\n---\n\n# {{TITLE}}\n\n" },
        { name: '灵感', folder: '灵感捕捉', template: "---\ntype: idea\ndate: {{DATE}}\n---\n\n" }
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
    renderArea: HTMLElement;
    currentMonth: moment.Moment; // 当前查看的月份状态

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

        // 1. 顶栏排版
        const header = container.createDiv({ cls: 'baseline-header' });
        header.createDiv({ text: moment().format('M月D日 dddd'), cls: 'baseline-date' });
        header.createEl('h1', { text: '控制中心', cls: 'baseline-title' });

        // 2. 统一操作区：一个大按钮
        const actionsContainer = container.createDiv({ cls: 'dashboard-actions' });
        const mainBtn = actionsContainer.createDiv({ cls: 'dashboard-card primary-action' });
        mainBtn.createDiv({ text: '✨ 新建内容', cls: 'primary-action-title' });
        mainBtn.onclick = () => this.promptNewNote();

        // 3. 数据看板区：月度热力日历
        const dataSection = container.createDiv({ cls: 'dashboard-data-section' });
        
        const chartHeader = dataSection.createDiv({ cls: 'chart-header-row' });
        chartHeader.createEl('span', { text: '足迹回顾', cls: 'chart-title' });
        
        // 月份切换导航
        const monthNav = chartHeader.createDiv({ cls: 'month-nav' });
        const prevBtn = monthNav.createEl('button', { text: '‹', cls: 'month-nav-btn' });
        const monthLabel = monthNav.createEl('span', { text: this.currentMonth.format('YYYY.MM'), cls: 'month-label' });
        const nextBtn = monthNav.createEl('button', { text: '›', cls: 'month-nav-btn' });

        this.renderArea = dataSection.createDiv({ cls: 'heatmap-calendar-wrapper' });

        // 绑定切换事件
        prevBtn.onclick = () => {
            this.currentMonth.subtract(1, 'months');
            monthLabel.innerText = this.currentMonth.format('YYYY.MM');
            this.renderMonthCalendar();
        };
        nextBtn.onclick = () => {
            this.currentMonth.add(1, 'months');
            monthLabel.innerText = this.currentMonth.format('YYYY.MM');
            this.renderMonthCalendar();
        };

        this.renderMonthCalendar();
    }

    // --- 核心逻辑：渲染月度热力日历 ---
    renderMonthCalendar() {
        this.renderArea.empty();

        const year = this.currentMonth.year();
        const month = this.currentMonth.month();
        const daysInMonth = this.currentMonth.daysInMonth();
        
        // 获取第一天是星期几 (0:周日, 6:周六)
        const firstDayOfMonth = moment([year, month, 1]).day();

        // 渲染星期表头
        const weekdaysGrid = this.renderArea.createDiv({ cls: 'calendar-weekdays' });
        ['日', '一', '二', '三', '四', '五', '六'].forEach(day => {
            weekdaysGrid.createDiv({ text: day });
        });

        const grid = this.renderArea.createDiv({ cls: 'calendar-grid' });

        // 1. 获取本月所有笔记的统计数据
        const stats = this.getNoteStatsForMonth(year, month);
        const maxCount = Math.max(...Object.values(stats), 1);

        // 2. 填充月初的空白占位格子
        for (let i = 0; i < firstDayOfMonth; i++) {
            grid.createDiv({ cls: 'calendar-cell empty' });
        }

        // 3. 渲染本月天数
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = moment([year, month, day]).format('YYYY-MM-DD');
            const count = stats[dateStr] || 0;
            
            const cell = grid.createDiv({ cls: 'calendar-cell', text: day.toString() });
            cell.title = `${dateStr}: ${count} 篇内容`;

            // 如果有数据，计算热力等级加深颜色
            if (count > 0) {
                const level = Math.ceil((count / maxCount) * 4);
                cell.addClass(`level-${level}`);
            }
        }
    }

    // 获取特定月份的统计数据
    getNoteStatsForMonth(year: number, month: number) {
        const files = this.app.vault.getMarkdownFiles();
        const stats: { [key: string]: number } = {};
        
        const targetMonthStart = moment([year, month, 1]).startOf('day');
        const targetMonthEnd = moment([year, month, 1]).endOf('month');

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const dateStr = cache?.frontmatter?.date || moment(file.stat.ctime).format('YYYY-MM-DD');
            const fileDate = moment(dateStr);
            
            // 如果文件日期在这个月内
            if (fileDate.isBetween(targetMonthStart, targetMonthEnd, 'day', '[]')) {
                const label = fileDate.format('YYYY-MM-DD');
                stats[label] = (stats[label] || 0) + 1;
            }
        });
        return stats;
    }

    // --- 新建内容弹窗 (带类型选择) ---
    async promptNewNote() {
        const actions = this.plugin.settings.actions.filter(a => a.name);
        if (actions.length === 0) {
            console.error("请先在设置中配置至少一个内容类型！");
            return;
        }

        new QuickNoteModal(this.app, actions, async (selectedAction, title, date) => {
            const parsedFolder = selectedAction.folder
                .replace(/\{\{YYYY\}\}/g, moment(date).format('YYYY'))
                .replace(/\{\{MM\}\}/g, moment(date).format('MM'));
            
            const parsedContent = selectedAction.template
                .replace(/\{\{DATE\}\}/g, date)
                .replace(/\{\{TITLE\}\}/g, title);

            await this.ensureFolder(parsedFolder);
            const fileName = `${parsedFolder}/${title}.md`;
            
            try {
                const file = await this.app.vault.create(fileName, parsedContent);
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
            } catch (e) {
                console.error("创建失败", e);
            }
        }).open();
    }

    async ensureFolder(path: string) {
        const folders = path.split('/');
        let currentPath = "";
        for (const folder of folders) {
            currentPath += (currentPath === "" ? "" : "/") + folder;
            if (!(this.app.vault.getAbstractFileByPath(currentPath) instanceof TFolder)) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }
}

class QuickNoteModal extends Modal {
    title: string = "";
    date: string = moment().format('YYYY-MM-DD');
    actions: ActionConfig[];
    selectedAction: ActionConfig;
    onSubmit: (action: ActionConfig, title: string, date: string) => void;

    constructor(app: any, actions: ActionConfig[], onSubmit: (action: ActionConfig, title: string, date: string) => void) {
        super(app);
        this.actions = actions;
        this.selectedAction = actions[0]; // 默认选中第一个
        this.onSubmit = onSubmit;
        this.title = `${moment().format('MMDD')}-`;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: `记录新内容` });

        // ⭐ 新增：类型下拉菜单
        new Setting(contentEl)
            .setName('内容类型')
            .addDropdown(drop => {
                this.actions.forEach(a => drop.addOption(a.name, a.name));
                drop.setValue(this.selectedAction.name);
                drop.onChange(value => {
                    this.selectedAction = this.actions.find(a => a.name === value) || this.actions[0];
                });
            });

        new Setting(contentEl)
            .setName('标题')
            .addText(text => {
                text.setValue(this.title);
                text.onChange(value => this.title = value);
            });

        new Setting(contentEl)
            .setName('归档日期')
            .addText(text => {
                text.setValue(this.date);
                text.onChange(value => this.date = value);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('确认创建')
                .setCta()
                .onClick(() => {
                    if (!this.title) return;
                    this.close();
                    this.onSubmit(this.selectedAction, this.title, this.date);
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

        new Setting(containerEl)
            .setName('启动时自动打开')
            .setDesc('每次打开 Obsidian 时自动跳转到控制中心面板。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.openOnStartup = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl('h3', { text: '内容类型管理' });
        containerEl.createEl('p', { text: '在这里配置弹窗下拉菜单中的可选类型。支持变量：{{YYYY}}, {{MM}}, {{DATE}}, {{TITLE}}。', cls: 'setting-item-description' });

        this.plugin.settings.actions.forEach((action, index) => {
            containerEl.createEl('h4', { text: `类型 ${index + 1}` });
            new Setting(containerEl).setName('名称').addText(text => text.setValue(action.name).onChange(async (val) => { action.name = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('保存文件夹').addText(text => text.setValue(action.folder).onChange(async (val) => { action.folder = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('默认模板').addTextArea(text => {
                text.setValue(action.template).onChange(async (val) => { action.template = val; await this.plugin.saveSettings(); });
                text.inputEl.rows = 4; text.inputEl.cols = 40;
            });
        });
    }
}
