import { Plugin, WorkspaceLeaf, ItemView, TFile, TFolder, Modal, Setting } from 'obsidian';
import { Chart, registerables } from 'chart.js';
import moment from 'moment';

Chart.register(...registerables);

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

export default class DashboardPlugin extends Plugin {
    async onload() {
        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

        this.addRibbonIcon('layout-dashboard', '打开快捷主页', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'show-dashboard',
            name: '显示主页看板',
            callback: () => this.activateView(),
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

    constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_DASHBOARD; }
    getDisplayText() { return "快捷主页"; }
    getIcon() { return "layout-dashboard"; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('dashboard-container');

        // Header
        const header = container.createDiv({ cls: 'dashboard-header' });
        header.createEl('h2', { text: '✨ 控制中心' });
        header.createEl('p', { text: '快速记录，回顾成长' });

        // Action Grid
        const actions = container.createDiv({ cls: 'dashboard-actions' });
        
        this.createActionCard(actions, '📝', '写日记', () => this.promptNewNote('diary'));
        this.createActionCard(actions, '💡', '记知识', () => this.promptNewNote('knowledge'));

        // Chart Section
        const chartBox = container.createDiv({ cls: 'dashboard-chart-container' });
        const controls = chartBox.createDiv({ cls: 'chart-controls' });
        
        const weekBtn = controls.createEl('button', { text: '周', cls: 'chart-btn' });
        const monthBtn = controls.createEl('button', { text: '月', cls: 'chart-btn' });

        const canvas = chartBox.createEl('canvas') as HTMLCanvasElement;
        
        weekBtn.onclick = () => this.renderChart(canvas, 'week');
        monthBtn.onclick = () => this.renderChart(canvas, 'month');

        // Initial Chart
        this.renderChart(canvas, 'week');
    }

    createActionCard(parent: HTMLElement, icon: string, title: string, onClick: () => void) {
        const card = parent.createDiv({ cls: 'dashboard-card' });
        card.createDiv({ text: icon, cls: 'dashboard-card-icon' });
        card.createDiv({ text: title, cls: 'dashboard-card-title' });
        card.onclick = onClick;
    }

    async promptNewNote(type: string) {
        new QuickNoteModal(this.app, type, async (title, date) => {
            const folderPath = type === 'diary' 
                ? `日记/${moment(date).format('YYYY/MM')}`
                : `知识库`;
            
            await this.ensureFolder(folderPath);
            const fileName = type === 'diary' 
                ? `${folderPath}/${moment(date).format('DD')}-${title}.md`
                : `${folderPath}/${title}.md`;

            const content = `---\ntype: ${type}\ndate: ${date}\n---\n\n# ${title}\n\n`;
            
            try {
                const file = await this.app.vault.create(fileName, content);
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

    renderChart(canvas: HTMLCanvasElement, range: 'week' | 'month') {
        const ctx = canvas.getContext('2d');
        if (this.chart) this.chart.destroy();

        const dataMap = this.getNoteStats(range);
        
        this.chart = new Chart(ctx!, {
            type: 'line',
            data: {
                labels: Object.keys(dataMap),
                datasets: [{
                    label: '笔记数量',
                    data: Object.values(dataMap),
                    borderColor: '#7575ff',
                    tension: 0.3,
                    fill: true,
                    backgroundColor: 'rgba(117, 117, 255, 0.1)'
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    getNoteStats(range: 'week' | 'month') {
        const files = this.app.vault.getMarkdownFiles();
        const stats: { [key: string]: number } = {};
        
        const format = range === 'week' ? 'ddd' : 'MM-DD';
        const limit = range === 'week' ? 7 : 30;

        // Initialize last X days
        for (let i = limit - 1; i >= 0; i--) {
            const d = moment().subtract(i, 'days').format(format);
            stats[d] = 0;
        }

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const dateStr = cache?.frontmatter?.date || moment(file.stat.ctime).format('YYYY-MM-DD');
            const fileDate = moment(dateStr);
            
            if (fileDate.isAfter(moment().subtract(limit, 'days'))) {
                const label = fileDate.format(format);
                if (stats[label] !== undefined) stats[label]++;
            }
        });

        return stats;
    }
}

class QuickNoteModal extends Modal {
    title: string = "";
    date: string = moment().format('YYYY-MM-DD');
    type: string;
    onSubmit: (title: string, date: string) => void;

    constructor(app: any, type: string, onSubmit: (title: string, date: string) => void) {
        super(app);
        this.type = type;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: `新建${this.type === 'diary' ? '日记' : '知识笔记'}` });

        new Setting(contentEl)
            .setName('标题')
            .addText(text => text.onChange(value => this.title = value));

        if (this.type === 'diary') {
            new Setting(contentEl)
                .setName('日期')
                .addText(text => {
                    text.setValue(this.date);
                    text.onChange(value => this.date = value);
                });
        }

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
