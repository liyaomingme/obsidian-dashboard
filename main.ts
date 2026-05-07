import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App } from 'obsidian';
import { Chart, registerables } from 'chart.js';
import moment from 'moment';

Chart.register(...registerables);

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

// --- 定义设置数据结构 (移除 Icon) ---
interface ActionConfig {
    name: string;
    folder: string;
    template: string;
}

interface DashboardSettings {
    openOnStartup: boolean; // 新增：启动时自动打开
    actions: ActionConfig[];
}

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
        this.addCommand({ id: 'show-dashboard', name: '显示主页看板', callback: () => this.activateView() });
        this.addSettingTab(new DashboardSettingTab(this.app, this));

        // ⭐ 新增：监听 Obsidian 启动完成事件，决定是否自动打开
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.openOnStartup) {
                this.activateView();
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

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
    chart: any;
    renderArea: HTMLElement;
    actionsContainer: HTMLElement;
    currentViewIndex: number = 0;
    views = [
        { id: 'week', name: '周数据' },
        { id: 'month', name: '月数据' },
        { id: 'heatmap', name: '热力分布' }
    ];

    constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_DASHBOARD; }
    getDisplayText() { return "控制中心"; }
    getIcon() { return "layout-dashboard"; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('dashboard-container');

        // 1. 顶栏排版
        const header = container.createDiv({ cls: 'baseline-header' });
        moment.locale(window.localStorage.getItem('language') || 'zh-cn');
        header.createDiv({ text: moment().format('M月D日 dddd').toUpperCase(), cls: 'baseline-date' });
        header.createEl('h1', { text: '控制中心', cls: 'baseline-title' });

        // 2. 动作区
        this.actionsContainer = container.createDiv({ cls: 'dashboard-actions' });
        this.renderActions();

        // 3. 数据看板区
        const dataSection = container.createDiv({ cls: 'dashboard-data-section' });
        
        const chartHeader = dataSection.createDiv({ cls: 'chart-header-row' });
        const titleArea = chartHeader.createDiv();
        titleArea.createEl('span', { text: '数据回顾', cls: 'chart-title' });
        const subTitle = titleArea.createEl('span', { text: `${this.views[0].name}`, cls: 'chart-subtitle' });
        
        const toggleBtn = chartHeader.createEl('button', { cls: 'chart-toggle-btn' });
        // 极简切换图标 (无文字)
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>`;

        this.renderArea = dataSection.createDiv({ cls: 'chart-render-area' });

        toggleBtn.onclick = () => {
            toggleBtn.toggleClass('rotating', true);
            setTimeout(() => toggleBtn.toggleClass('rotating', false), 500);

            this.renderArea.addClass('animating');
            
            setTimeout(() => {
                this.currentViewIndex = (this.currentViewIndex + 1) % this.views.length;
                const nextView = this.views[this.currentViewIndex];
                subTitle.innerText = `${nextView.name}`;
                
                if (nextView.id === 'week') this.renderLineChart('week');
                else if (nextView.id === 'month') this.renderLineChart('month');
                else this.renderHeatmap();

                this.renderArea.removeClass('animating');
            }, 400); 
        };

        this.renderLineChart('week');
    }

    renderActions() {
        this.actionsContainer.empty();
        this.plugin.settings.actions.forEach(action => {
            if (!action.name) return;
            const card = this.actionsContainer.createDiv({ cls: 'dashboard-card' });
            // 纯文字，去掉 Icon
            card.createDiv({ text: action.name, cls: 'dashboard-card-title' });
            card.onclick = () => this.promptNewNote(action);
        });
    }

    async promptNewNote(config: ActionConfig) {
        new QuickNoteModal(this.app, config.name, async (title, date) => {
            const parsedFolder = config.folder
                .replace(/\{\{YYYY\}\}/g, moment(date).format('YYYY'))
                .replace(/\{\{MM\}\}/g, moment(date).format('MM'));
            
            const parsedContent = config.template
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

    renderLineChart(range: 'week' | 'month') {
        this.renderArea.empty();
        const canvas = this.renderArea.createEl('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (this.chart) this.chart.destroy();

        const dataMap = this.getNoteStats(range === 'week' ? 7 : 30);
        const computedStyle = getComputedStyle(document.body);
        const accentColor = computedStyle.getPropertyValue('--interactive-accent').trim() || '#000000';

        this.chart = new Chart(ctx!, {
            type: 'line',
            data: {
                labels: Object.keys(dataMap),
                datasets: [{
                    label: '笔记数量',
                    data: Object.values(dataMap),
                    borderColor: accentColor,
                    borderWidth: 4, // 边框加粗，更具设计感
                    tension: 0.5, // 极致平滑
                    pointRadius: 0,
                    pointHitRadius: 30,
                    fill: true,
                    backgroundColor: (context) => {
                        const chartCtx = context.chart.ctx;
                        const gradient = chartCtx.createLinearGradient(0, 0, 0, context.chart.height);
                        gradient.addColorStop(0, `${accentColor}30`);
                        gradient.addColorStop(1, `${accentColor}00`);
                        return gradient;
                    }
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { grid: { display: false }, ticks: { font: { weight: 'bold' } } }, 
                    y: { beginAtZero: true, ticks: { stepSize: 1, display: false }, grid: { display: false }, border: { display: false } }
                }
            }
        });
    }

    renderHeatmap() {
        this.renderArea.empty();
        const wrapper = this.renderArea.createDiv({ cls: 'heatmap-wrapper' });
        const grid = wrapper.createDiv({ cls: 'heatmap-grid' });
        if (this.chart) { this.chart.destroy(); this.chart = null; }

        const stats = this.getNoteStats(84, 'YYYY-MM-DD');
        const maxCount = Math.max(...Object.values(stats), 1);

        for (const dateStr in stats) {
            const count = stats[dateStr];
            const cell = grid.createDiv({ cls: 'heatmap-cell' });
            if (count > 0) cell.addClass(`heatmap-level-${Math.ceil((count / maxCount) * 4)}`);
            cell.title = `${dateStr}: ${count} 篇笔记`;
        }

        const labels = wrapper.createDiv({ cls: 'heatmap-labels' });
        labels.createSpan({ text: '12周前' });
        labels.createSpan({ text: '最近' });
    }

    getNoteStats(daysLimit: number, formatStr?: string) {
        const files = this.app.vault.getMarkdownFiles();
        const stats: { [key: string]: number } = {};
        const format = formatStr || (daysLimit === 7 ? 'ddd' : 'MM-DD');

        for (let i = daysLimit - 1; i >= 0; i--) {
            stats[moment().subtract(i, 'days').format(format)] = 0;
        }

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const dateStr = cache?.frontmatter?.date || moment(file.stat.ctime).format('YYYY-MM-DD');
            const fileDate = moment(dateStr);
            if (fileDate.isAfter(moment().subtract(daysLimit, 'days').startOf('day'))) {
                const label = fileDate.format(format);
                if (stats[label] !== undefined) stats[label]++;
            }
        });
        return stats;
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
    onSubmit: (title: string, date: string) => void;

    constructor(app: any, titlePrefix: string, onSubmit: (title: string, date: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.title = `${moment().format('MMDD')}-`;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: `新建内容` });

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
                    this.onSubmit(this.title, this.date);
                }));
    }
}

// --- 高级设置面板 ---
class DashboardSettingTab extends PluginSettingTab {
    plugin: DashboardPlugin;
    constructor(app: App, plugin: DashboardPlugin) { super(app, plugin); this.plugin = plugin; }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '控制中心设置' });

        // ⭐ 新增：自动启动开关
        new Setting(containerEl)
            .setName('启动时自动打开主页')
            .setDesc('每次打开 Obsidian 时自动跳转到控制中心面板。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.openOnStartup = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl('h3', { text: '路由与模板设置' });
        containerEl.createEl('p', { text: '自定义快捷按钮。支持变量：{{YYYY}} 年, {{MM}} 月, {{DATE}} 完整日期, {{TITLE}} 标题。', cls: 'setting-item-description' });

        this.plugin.settings.actions.forEach((action, index) => {
            containerEl.createEl('h4', { text: `模块 ${index + 1}` });
            
            new Setting(containerEl).setName('按钮名称 (留空则隐藏)').addText(text => text.setValue(action.name).onChange(async (val) => { action.name = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('保存文件夹').addText(text => text.setValue(action.folder).onChange(async (val) => { action.folder = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('默认格式 (YAML/内容)').addTextArea(text => {
                text.setValue(action.template).onChange(async (val) => { action.template = val; await this.plugin.saveSettings(); });
                text.inputEl.rows = 5;
                text.inputEl.cols = 40;
            });
        });
    }
}
