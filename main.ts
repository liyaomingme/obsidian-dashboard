import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App } from 'obsidian';
import { Chart, registerables } from 'chart.js';
import moment from 'moment';

Chart.register(...registerables);

const VIEW_TYPE_DASHBOARD = "mobile-dashboard-view";

export default class DashboardPlugin extends Plugin {
    async onload() {
        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

        this.addRibbonIcon('layout-dashboard', '控制中心', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'show-dashboard',
            name: '显示主页看板',
            callback: () => this.activateView(),
        });

        this.addSettingTab(new DashboardSettingTab(this.app, this));
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

        // 1. Apple 风格顶栏 (日期与大标题)
        const header = container.createDiv({ cls: 'apple-header' });
        // 获取当前系统语言的日期格式，例如 "5月7日 星期四"
        moment.locale(window.localStorage.getItem('language') || 'zh-cn');
        const todayStr = moment().format('M月D日 dddd');
        header.createDiv({ text: todayStr, cls: 'apple-date' });
        header.createEl('h1', { text: '控制中心', cls: 'apple-title' });

        // 2. Apple 风格操作卡片
        const actions = container.createDiv({ cls: 'dashboard-actions' });
        this.createActionCard(actions, '📝', '写日记', () => this.promptNewNote('diary'));
        this.createActionCard(actions, '💡', '记知识', () => this.promptNewNote('knowledge'));

        // 3. 数据看板区 (图表与热力图)
        const dataSection = container.createDiv({ cls: 'dashboard-data-section' });
        
        // 3.1 分段控制器 (切换选项卡)
        const segmentedControl = dataSection.createDiv({ cls: 'apple-segmented-control' });
        const btnWeek = segmentedControl.createEl('button', { text: '周曲线', cls: 'segment-btn active' });
        const btnMonth = segmentedControl.createEl('button', { text: '月曲线', cls: 'segment-btn' });
        const btnHeatmap = segmentedControl.createEl('button', { text: '热力图', cls: 'segment-btn' });

        // 3.2 渲染区域
        this.renderArea = dataSection.createDiv({ cls: 'chart-render-area' });

        // 绑定切换事件
        const btns = [btnWeek, btnMonth, btnHeatmap];
        const switchView = (activeBtn: HTMLElement, viewType: string) => {
            btns.forEach(b => b.removeClass('active'));
            activeBtn.addClass('active');
            
            if (viewType === 'week') this.renderLineChart('week');
            else if (viewType === 'month') this.renderLineChart('month');
            else if (viewType === 'heatmap') this.renderHeatmap();
        };

        btnWeek.onclick = () => switchView(btnWeek, 'week');
        btnMonth.onclick = () => switchView(btnMonth, 'month');
        btnHeatmap.onclick = () => switchView(btnHeatmap, 'heatmap');

        // 默认渲染周图表
        this.renderLineChart('week');
    }

    createActionCard(parent: HTMLElement, icon: string, title: string, onClick: () => void) {
        const card = parent.createDiv({ cls: 'dashboard-card' });
        card.createDiv({ text: icon, cls: 'dashboard-card-icon' });
        card.createDiv({ text: title, cls: 'dashboard-card-title' });
        card.onclick = onClick;
    }

    // ----- 曲线图渲染逻辑 -----
    renderLineChart(range: 'week' | 'month') {
        this.renderArea.empty();
        const canvas = this.renderArea.createEl('canvas') as HTMLCanvasElement;
        
        const ctx = canvas.getContext('2d');
        if (this.chart) this.chart.destroy();

        const dataMap = this.getNoteStats(range === 'week' ? 7 : 30);
        
        // 获取 Obsidian 主题颜色
        const computedStyle = getComputedStyle(document.body);
        const accentColor = computedStyle.getPropertyValue('--interactive-accent').trim() || '#007AFF'; // 默认 fallback 为 Apple 蓝

        this.chart = new Chart(ctx!, {
            type: 'line',
            data: {
                labels: Object.keys(dataMap),
                datasets: [{
                    label: '笔记数量',
                    data: Object.values(dataMap),
                    borderColor: accentColor,
                    borderWidth: 3,
                    tension: 0.4, // 苹果风格的平滑曲线
                    pointRadius: 0, // 隐藏数据点，让曲线更极简
                    pointHitRadius: 20,
                    fill: true,
                    backgroundColor: (context) => {
                        const chartCtx = context.chart.ctx;
                        const gradient = chartCtx.createLinearGradient(0, 0, 0, context.chart.height);
                        gradient.addColorStop(0, `${accentColor}40`); // 25% opacity
                        gradient.addColorStop(1, `${accentColor}00`); // 0% opacity
                        return gradient;
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { grid: { display: false } }, // 隐藏 X 轴网格线使界面更干净
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { display: false } }
                }
            }
        });
    }

    // ----- 热力图渲染逻辑 -----
    renderHeatmap() {
        this.renderArea.empty();
        const wrapper = this.renderArea.createDiv({ cls: 'heatmap-wrapper' });
        const grid = wrapper.createDiv({ cls: 'heatmap-grid' });
        
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        // 获取过去 84 天（12周，适合手机横排显示）的数据
        const daysToTrack = 84;
        const stats = this.getNoteStats(daysToTrack, 'YYYY-MM-DD');
        
        const values = Object.values(stats);
        const maxCount = Math.max(...values, 1); // 找出最大数量用于计算颜色深浅级别

        // 生成网格
        for (const dateStr in stats) {
            const count = stats[dateStr];
            const cell = grid.createDiv({ cls: 'heatmap-cell' });
            
            // 计算热力等级 (1-4)
            if (count > 0) {
                const level = Math.ceil((count / maxCount) * 4);
                cell.addClass(`heatmap-level-${level}`);
            }
            
            // 添加原生 tooltip
            cell.title = `${dateStr}: ${count} 篇笔记`;
        }

        // 添加月份标签标识 (简略版)
        const labels = wrapper.createDiv({ cls: 'heatmap-labels' });
        labels.createSpan({ text: '12周前' });
        labels.createSpan({ text: '今天' });
    }

    // 数据获取统筹函数
    getNoteStats(daysLimit: number, formatStr?: string) {
        const files = this.app.vault.getMarkdownFiles();
        const stats: { [key: string]: number } = {};
        
        // 如果没有传入特定格式，周图用星期几，月图用 MM-DD
        const defaultFormat = daysLimit === 7 ? 'ddd' : 'MM-DD';
        const format = formatStr || defaultFormat;

        // 初始化过去 X 天的占位符（保证即使没记笔记也有数据点）
        for (let i = daysLimit - 1; i >= 0; i--) {
            const d = moment().subtract(i, 'days').format(format);
            stats[d] = 0;
        }

        // 遍历统计
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

    // ----- 新建笔记弹窗逻辑 -----
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

class DashboardSettingTab extends PluginSettingTab {
    plugin: DashboardPlugin;
    constructor(app: App, plugin: DashboardPlugin) { super(app, plugin); this.plugin = plugin; }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '控制中心设置' });

        new Setting(containerEl)
            .setName('日记默认文件夹')
            .setDesc('目前固定在 "日记/YYYY/MM" 路径，未来版本将支持自定义。')
            .addText(text => text.setPlaceholder('日记').setDisabled(true));
    }
}
