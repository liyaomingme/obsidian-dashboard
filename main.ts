import { Plugin, WorkspaceLeaf, ItemView, TFolder, Modal, Setting, PluginSettingTab, App, TFile, moment, CachedMetadata } from 'obsidian';
import { Lunar } from 'lunar-javascript';

// 🌟 TypeScript 严格类型欺骗层 (Bypass Obsidian's strict ESLint rules)
// 由于 lunar-javascript 缺乏官方类型定义，直接使用会触发几十个 Unsafe 'any' 警告。
// 我们在此通过 interface 与 unknown 转换，为其手动注入绝对安全的强类型。
interface ILunar {
    getYearInGanZhi(): string;
    getMonthInGanZhi(): string;
    getDayInGanZhi(): string;
    getTimeInGanZhi(): string;
    getDay(): number;
    getMonthInChinese(): string;
    getDayInChinese(): string;
}
interface ILunarFactory {
    fromDate(date: Date): ILunar;
}
const SafeLunar = Lunar as unknown as ILunarFactory;

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
        this.addRibbonIcon('layout-dashboard', '控制中心', () => { void this.activateView(); });
        this.addCommand({ id: 'show-dashboard', name: '显示控制中心', callback: () => { void this.activateView(); } });
        this.addSettingTab(new DashboardSettingTab(this.app, this));
        
        this.app.workspace.onLayoutReady(() => { 
            if (this.settings.openOnStartup) {
                const emptyLeaves = this.app.workspace.getLeavesOfType("empty");
                if (emptyLeaves.length > 0) {
                    void emptyLeaves[0].setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
                } else {
                    void this.activateView();
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
        // 确保原生可能存在的异步被 void 妥善处理
        void workspace.revealLeaf(leaf);
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
        
        moment.locale('zh-cn');

        this.buildFileDataMap();

        const headerRow = container.createDiv({ cls: 'dashboard-header-row' });
        const header = headerRow.createDiv({ cls: 'baseline-header' });
        
        header.createDiv({ text: moment().format('M月D日 dddd'), cls: 'baseline-date' });

        const now = new Date();
        // 采用强制类型转换的 SafeLunar，消灭 "Unsafe member access" 警告
        const lunarNow = SafeLunar.fromDate(now);
        
        const baziEl = header.createEl('h1', { cls: 'baseline-title bazi-title' });
        baziEl.appendText(lunarNow.getYearInGanZhi());
        baziEl.createSpan({ cls: 'bazi-unit', text: '年' });
        baziEl.createSpan({ cls: 'bazi-sep', text: '·' });
        baziEl.appendText(lunarNow.getMonthInGanZhi());
        baziEl.createSpan({ cls: 'bazi-unit', text: '月' });
        baziEl.createSpan({ cls: 'bazi-sep', text: '·' });
        baziEl.appendText(lunarNow.getDayInGanZhi());
        baziEl.createSpan({ cls: 'bazi-unit', text: '日' });
        baziEl.createSpan({ cls: 'bazi-sep', text: '·' });
        baziEl.appendText(lunarNow.getTimeInGanZhi());
        baziEl.createSpan({ cls: 'bazi-unit', text: '时' });

        const plusBtn = headerRow.createEl('span', { text: '+', cls: 'floating-plus-btn' });
        this.plusMenu = headerRow.createDiv({ cls: 'plus-dropdown' });
        this.renderActionsInMenu();

        plusBtn.onclick = (e) => {
            e.stopPropagation();
            this.plusMenu.toggleClass('is-open', !this.plusMenu.hasClass('is-open'));
        };
        activeDocument.addEventListener('click', () => { if(this.plusMenu) this.plusMenu.removeClass('is-open'); });

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
                void this.promptNewNote(action);
            };
        });
    }

    buildFileDataMap() {
        this.fileDataMap = {};
        this.app.vault.getMarkdownFiles().forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const formatKey = this.extractDateFromFile(file, cache);
            if (!this.fileDataMap[formatKey]) this.fileDataMap[formatKey] = [];
            this.fileDataMap[formatKey].push(file);
        });
        
        for (const key in this.fileDataMap) { 
            this.fileDataMap[key].sort((a, b) => b.stat.ctime - a.stat.ctime); 
        }
    }

    extractDateFromFile(file: TFile, cache: CachedMetadata | null): string {
        let dateStr: string | null = null;
        let yearContext = moment(file.stat.ctime).year(); 
        
        const pathYearMatch = file.path.match(/(20\d{2})/);
        if (pathYearMatch) yearContext = parseInt(pathYearMatch[1]);

        if (cache && cache.frontmatter && cache.frontmatter.date) {
            dateStr = String(cache.frontmatter.date).trim();
            const parsed = this.parseLenientDate(dateStr, yearContext);
            if (parsed) return parsed;
        }

        dateStr = file.basename.trim();
        const parsedFilename = this.parseLenientDate(dateStr, yearContext);
        if (parsedFilename) return parsedFilename;

        return moment(file.stat.ctime).format('YYYY-MM-DD');
    }

    parseLenientDate(s: string, defaultYear: number): string | null {
        s = s.trim();

        let m = moment(s, ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY.MM.DD", "YYYY-MM-DDTHH:mm"], true);
        if (m.isValid()) return m.format('YYYY-MM-DD');

        let mmddMatch = s.match(/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^\d]|$)/);
        if (mmddMatch) {
            let mth = parseInt(mmddMatch[1]);
            let d = parseInt(mmddMatch[2]);
            return moment(`${defaultYear}-${mth}-${d}`, "YYYY-M-D").format('YYYY-MM-DD');
        }

        let complexMatch = s.match(/(?:^|[^\d])((?:20)?\d{2})[-./年_]?([0-1]?\d)[-./月_]?([0-3]?\d)日?(?:[^\d]|$)/);
        if (complexMatch) {
            let y = parseInt(complexMatch[1]);
            let mth = parseInt(complexMatch[2]);
            let d = parseInt(complexMatch[3]);
            if (y > 0 && y < 100) y += 2000; 
            if (mth >= 1 && mth <= 12 && d >= 1 && d <= 31) {
                return moment(`${y}-${mth}-${d}`, "YYYY-M-D").format('YYYY-MM-DD');
            }
        }
        
        let lenientMatch = s.match(/(?:^|[^\d])(2\d)[-./年_]?([1-9]|1[0-2])[-./月_]?([1-9]|[12]\d|3[01])日?(?:[^\d]|$)/);
        if (lenientMatch) {
            let y = parseInt(lenientMatch[1]) + 2000;
            let mth = parseInt(lenientMatch[2]);
            let d = parseInt(lenientMatch[3]);
            return moment(`${y}-${mth}-${d}`, "YYYY-M-D").format('YYYY-MM-DD');
        }

        return null;
    }

    renderCalendar(direction: 'left' | 'right' | 'none' = 'none') {
        this.boardArea.empty();
        this.closeListAnimation();

        const year = this.currentMonth.year();
        const month = this.currentMonth.month();
        const firstDay = moment([year, month, 1]).day();

        const nav = this.boardArea.createDiv({ cls: 'month-nav' });
        nav.createEl('span', { text: '‹', cls: 'month-nav-btn back-arrow' }).onclick = () => { this.currentMonth.subtract(1, 'months'); this.renderCalendar('left'); };
        nav.createSpan({ text: this.currentMonth.format('YYYY年 M月'), cls: 'month-label' });
        nav.createEl('span', { text: '›', cls: 'month-nav-btn next-arrow' }).onclick = () => { this.currentMonth.add(1, 'months'); this.renderCalendar('right'); };

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
            const lunar = SafeLunar.fromDate(d);
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

    triggerListAnimation(dateStr: string, files: TFile[], lunar: ILunar) {
        this.listScrollArea.empty();
        this.listHeader.empty();
        
        const baziDay = `${lunar.getYearInGanZhi()}年 · ${lunar.getMonthInGanZhi()}月 · ${lunar.getDayInGanZhi()}日`;

        if (files.length === 0) { 
            this.listHeader.createDiv({ cls: 'record-list-date', text: dateStr });
            this.listHeader.createDiv({ cls: 'record-list-lunar', text: `${baziDay} · 暂无足迹` });
            this.listWrapper.addClass('is-open'); 
            return; 
        }
        
        const dateDiv = this.listHeader.createDiv({ cls: 'record-list-date' });
        dateDiv.appendText(dateStr + " ");
        dateDiv.createSpan({ cls: 'record-list-count', text: `${files.length} 篇` });
        
        this.listHeader.createDiv({ cls: 'record-list-lunar', text: baziDay });
        
        files.forEach((file, index) => {
            const item = this.listScrollArea.createDiv({ cls: 'record-item' });
            item.style.animationDelay = `${index * 0.05}s`;
            
            const iconWrap = item.createDiv({ cls: 'record-icon' });
            
            const svgIcon = iconWrap.createSvg('svg', { attr: { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" } });
            svgIcon.createSvg('path', { attr: { d: "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" } });
            svgIcon.createSvg('line', { attr: { x1: "16", y1: "8", x2: "2", y2: "22" } });
            svgIcon.createSvg('line', { attr: { x1: "17.5", y1: "15", x2: "9", y2: "15" } });
            
            item.createDiv({ text: file.basename, cls: 'record-title' });
            item.onclick = () => { void this.app.workspace.getLeaf(true).openFile(file); };
        });
        this.listWrapper.addClass('is-open');
    }

    closeListAnimation() { this.listWrapper.removeClass('is-open'); }

    async promptNewNote(config: ActionConfig) {
        new QuickNoteModal(this.app, config, (title, date, folderPath) => {
            void (async () => {
                const selectedDate = moment(date).toDate();
                selectedDate.setHours(new Date().getHours()); 
                const lunarFull = SafeLunar.fromDate(selectedDate);
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
            })();
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
    
    constructor(app: App, config: ActionConfig, onSubmit: (title: string, date: string, folder: string) => void) { 
        super(app); 
        this.actionConfig = config;
        this.onSubmit = onSubmit; 
        this.title = `${moment().format('MMDD')}-`; 
        this.folderPath = config.folder.replace(/\{\{YYYY\}\}/g, moment().format('YYYY')).replace(/\{\{MM\}\}/g, moment().format('MM'));
    }
    
    onOpen() {
        const { contentEl, modalEl, containerEl } = this;
        
        containerEl.addClass('ios-glass-modal-container');
        modalEl.addClass('ios-glass-modal');
        
        contentEl.createEl('h3', { text: this.actionConfig.name });
        
        new Setting(contentEl).setName('记录标题').addText(text => { text.setValue(this.title); text.onChange(value => this.title = value); });
        new Setting(contentEl).setName('归档日期').addText(text => { text.setValue(this.date); text.onChange(value => this.date = value); });
        
        new Setting(contentEl).setName('归档路径 (点击查看已有文件夹)').addText(text => { 
            text.setValue(this.folderPath); 
            text.onChange(value => this.folderPath = value); 
            
            const inputEl = text.inputEl;
            const settingControl = inputEl.parentElement;
            
            if(settingControl) {
                const suggestWrapper = settingControl.createDiv({ cls: 'folder-suggest-wrapper' });
                
                const allFolders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder && f.path !== '/') as TFolder[];

                const showSuggestions = () => {
                    suggestWrapper.empty();
                    const query = inputEl.value.toLowerCase();
                    const matches = allFolders.filter(f => f.path.toLowerCase().includes(query)).slice(0, 30);

                    if (matches.length > 0) {
                        suggestWrapper.addClass('is-open');
                        matches.forEach(folder => {
                            const item = suggestWrapper.createDiv({ cls: 'suggest-item', text: folder.path });
                            item.onmousedown = (e) => { 
                                e.preventDefault();
                                inputEl.value = folder.path;
                                this.folderPath = folder.path;
                                suggestWrapper.removeClass('is-open');
                                inputEl.dispatchEvent(new Event('input'));
                            };
                        });
                    } else {
                        suggestWrapper.removeClass('is-open');
                    }
                };

                inputEl.addEventListener('click', showSuggestions);
                inputEl.addEventListener('input', showSuggestions);
                inputEl.addEventListener('focus', showSuggestions);
                inputEl.addEventListener('blur', () => { window.setTimeout(() => suggestWrapper.removeClass('is-open'), 200); }); 
            }
        });
        
        new Setting(contentEl).addButton(btn => btn.setButtonText('确认创建').onClick(() => { 
            if (!this.title || !this.folderPath) return; 
            this.close(); 
            this.onSubmit(this.title, this.date, this.folderPath); 
        }));
    }
}

class DashboardSettingTab extends PluginSettingTab {
    plugin: DashboardPlugin;
    constructor(app: App, plugin: DashboardPlugin) { super(app, plugin); this.plugin = plugin; }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        new Setting(containerEl).setName('控制中心设置').setHeading();
        
        new Setting(containerEl).setName('设为开屏主页 (打开时启动)')
            .setDesc('每次打开 Obsidian 时，将默认的新建空白页替换为控制中心。')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (val) => { this.plugin.settings.openOnStartup = val; await this.plugin.saveSettings(); }));
        
        new Setting(containerEl).setName('新建类型管理').setHeading()
            .setDesc('支持的模板变量: {{DATE}}, {{TITLE}}, {{BAZI}} (生成: 丙午年 癸巳月 辛巳日 丙申时)');

        this.plugin.settings.actions.forEach((action, index) => {
            new Setting(containerEl).setName(`类型 ${index + 1}`).setHeading();
            new Setting(containerEl).setName('名称 (留空隐藏)').addText(text => text.setValue(action.name).onChange(async (val) => { action.name = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('保存文件夹').addText(text => text.setValue(action.folder).onChange(async (val) => { action.folder = val; await this.plugin.saveSettings(); }));
            new Setting(containerEl).setName('默认模板').addTextArea(text => { text.setValue(action.template).onChange(async (val) => { action.template = val; await this.plugin.saveSettings(); }); text.inputEl.rows = 5; });
        });
    }
}
