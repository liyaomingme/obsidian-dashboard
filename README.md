# Obsidian Mobile Dashboard

> 💻 **Are you on a Desktop or Tablet? / 电脑或平板宽屏用户请注意：**
> This repository is strictly optimized for modern smartphones (iPhone/Android). For widescreen devices featuring a dual-column layout, please visit the desktop version:
> 如果你在电脑、笔记本或 iPad 上使用，为了获得更强大的双栏排版体验，请前往桌面端专属版本：
> 👉 **[Click here for Obsidian Desktop Dashboard / 点击获取桌面/平板专属版](https://github.com/liyaomingme/obsidian-desktop-dashboard)**

[🇬🇧 English Version](#-english-version) | [🇨🇳 中文说明](#-中文说明)

A mobile-first dashboard plugin for Obsidian. Supports quick capture, visualizes note statistics with charts, and brings a highly refined traditional typography aesthetic to your mobile vault.

---

## 🇬🇧 English Version

Welcome to the **Mobile Dashboard** for Obsidian! This plugin completely transforms your empty startup page into a beautiful, functional, and mobile-optimized control center.

### ✨ Key Features

#### 1. Fluid Layout & "Dynamic Island" Safe Area
Designed specifically for modern smartphones (from narrow Androids to iPhone Pro Max):
* **Fluid Typography**: Uses CSS `clamp()` functions to dynamically scale fonts and grids based on your screen width. No more text overlapping or line breaks.
* **Safe Area Protection**: The quick-capture modal features a calculated top-margin (`12vh`) to perfectly avoid the iPhone Dynamic Island / Notch, while strictly controlling its max-height to leave generous room for native keyboards.

#### 2. Advanced Date Parser Engine (Sync-Proof)
Cross-device syncing (like iCloud or Syncthing) often resets file creation times, causing ordinary plugins to lose track of your notes. We solved this with a robust date parser:
* **Smart Extraction**: Automatically prioritizes the `date` property in YAML frontmatter.
* **Filename Fallback**: Intelligently extracts dates directly from filenames, supporting extreme shorthand formats (e.g., `0531`, `260602`, `26.06.02`, `26年6月2日`).
* **Folder Context**: If the year is omitted, the engine infers it from your folder path (e.g., `Journal/2026/05`).

#### 3. Traditional Typography & Almanac Aesthetics
We brought traditional letterpress aesthetics to Obsidian. 
* **Global Serif Integration**: Forced injection of high-quality Serif/Songti fonts (like *Noto Serif SC*, *Songti SC*, *ui-serif*) across all elements for a premium, catalog-like reading experience.
* **Chinese Almanac (Bazi) Axis**: Displays the traditional Chinese calendar at the top. The "Year, Month, Day, Hour" indicators are elegantly shrunk and subscripted, mirroring traditional typesetting.

#### 4. Silky Smooth Quick Capture
* **Floating Action Button**: A high-contrast, minimalist "+" button to quickly dump ideas.
* **Glassmorphism Modal**: A beautifully crafted frosted-glass UI with engraved-style input fields.
* **Flicker-Free Animations**: Integrated deeply with Obsidian's native DOM lifecycle, providing butter-smooth fade-ins and exits without any visual glitches.

### ⚙️ Installation

#### Method 1: Using BRAT (Recommended for Beta updates)
1. Install **[Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)** from the Community Plugins in Obsidian and enable it.
2. Go to the BRAT settings, click on **Add Beta plugin**.
3. Paste this repository path: `liyaomingme/obsidian-mobile-dashboard`
4. Click **Add Plugin**, wait for it to install, and then enable **Mobile Dashboard** in your installed plugins list.

#### Method 2: Manual Installation
1. Go to the **[Releases](https://github.com/liyaomingme/obsidian-mobile-dashboard/releases)** page of this repository.
2. Download the latest `main.js`, `manifest.json`, and `styles.css` files.
3. In your Obsidian vault, navigate to `.obsidian/plugins/` and create a new folder named `obsidian-mobile-dashboard`.
4. Place the three downloaded files into this new folder.
5. Restart Obsidian, go to Settings > Community plugins, and enable the plugin.

### 🚀 Usage
1. **Set as Homepage**: In the plugin settings, toggle on "Open on Startup" to replace the default empty page.
2. **Configure Actions**: Customize your quick capture templates, variables (`{{DATE}}`, `{{TITLE}}`, `{{BAZI}}`), and default save paths.

---

## 🇨🇳 中文说明

欢迎使用 **Obsidian 移动端控制中心 (Mobile Dashboard)**！这款插件致力于将你单调的默认启动页，彻底改造为一个兼具**古典排版美学**与**现代移动交互**的高级数据面板。

### ✨ 核心深度优化功能

#### 1. 流体自适应排版与“灵动岛”防遮挡
为现代所有尺寸的智能手机量身定制：
* **弹性流体网格 (Fluid Typography)**：彻底抛弃写死的像素。利用 `clamp()` 函数，无论是窄长的安卓机（如小米 13）还是宽大的 iPhone Pro Max，字体大小和日历格子都会像水一样自动缩放，**绝不重叠、绝不换行**。
* **安全区与防遮挡**：弹窗经过精密计算，顶部预留 `12vh` 的完美安全距离，彻底避开 iPhone **灵动岛和刘海**；同时收紧最大高度，为底部呼出的输入法键盘（包括第三方搜狗键盘）留出绝对充裕的操作空间。

#### 2. 终极“日期嗅探”引擎 (彻底解决多设备同步丢失日期)
多设备同步（iCloud/坚果云等）经常会导致文件的“系统创建时间”被重置，从而让日历无法检索到文章。我们重写了底层时间引擎：
* **智能正则嗅探**：不仅读取 YAML 区的 `date`，更能直接从**文件名**中强行提取日期。
* **极限速记支持**：完美支持各式各样的个人速记格式，无论是 `0531`、`260602`、`26.06.02`，还是 `26年6月2日`，甚至是缩写 `2662`，引擎都能精准还原为标准日期。
* **目录穿透推断**：如果文件名省略了年份，引擎会自动向上读取所在文件夹（如 `日记/2026/05`），智能补全年份。

#### 3. 极致的传统宋体印刷美学
把传统活字印刷的质感带入 Obsidian：
* **全局宋体强制注入**：全面调用苹果系统的 `ui-serif` (Songti SC) 与谷歌开源的 `Noto Serif SC`。从主标题、日历数字到下拉菜单，全方位覆盖高级衬线体。
* **八字注排法美学**：顶部引入“天干地支”农历时间轴。运用传统排版的“大小字注排法”，将主干放大加粗，将“年、月、日、时”作为副单位精巧缩放至右下角，主副分明，极具品味。

#### 4. 丝滑快捷的灵感捕获弹窗
* **悬浮快捷按钮**：随时随地一键呼出新建菜单。
* **毛玻璃雕刻质感**：采用高级的 `backdrop-filter` 磨砂玻璃背景，配合带有微弱内阴影的输入框，UI 极具“贵气”。
* **原生防闪烁动画**：完美契合 Obsidian 底层生命周期，彻底消灭了弹窗加载第一帧的“闪烁(Flash)”现象。
* **路径智能联想**：在输入归档路径时，自动检索库内已有的文件夹并提供下拉补全。

### ⚙️ 安装教程

#### 方法一：通过 BRAT 安装（推荐，方便接收后续更新）
1. 在 Obsidian 的【第三方插件】市场中搜索并安装 **Obsidian42 - BRAT** 插件，并启用它。
2. 打开 BRAT 的设置页面，点击 **Add Beta plugin** 按钮。
3. 在弹出的输入框中填入本仓库的地址：`liyaomingme/obsidian-mobile-dashboard`
4. 点击 **Add Plugin**，等待下载完成后，回到 Obsidian 的第三方插件列表，启用 **Mobile Dashboard** 即可。

#### 方法二：手动离线安装
1. 前往本仓库的 **[Releases](https://github.com/liyaomingme/obsidian-mobile-dashboard/releases)** 页面。
2. 下载最新版本中的三个核心文件：`main.js`、`manifest.json` 和 `styles.css`。
3. 打开你的手机 Obsidian 笔记库（Vault）所在的本地文件夹，进入 `.obsidian/plugins/` 目录。
4. 在该目录下新建一个名为 `obsidian-mobile-dashboard` 的文件夹。
5. 将刚才下载的 3 个文件复制到这个新文件夹中。
6. 重启 Obsidian，进入【设置】 -> 【第三方插件】，找到并开启它。

### 🚀 如何使用
1. **设为开屏主页**：进入插件设置，开启“打开时启动”选项，即可在每次打开手机版 Obsidian 时直接看到控制中心。
2. **自定义记录动作**：在设置中配置你的快捷捕获模板，支持动态变量：`{{DATE}}`（标准日期）、`{{TITLE}}`（标题）以及极其优雅的 `{{BAZI}}`（生成如：丙午年 癸巳月 辛巳日 丙申时）。
