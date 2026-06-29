<div align="center">

# ✨ 岁时案台 (Time Desk) | Mobile Dashboard

*A mobile-first dashboard plugin for Obsidian. Supports quick capture, visualizes note statistics, and brings a highly refined traditional typography aesthetic to your mobile vault.*
一款专为 Obsidian 移动端打造的控制中心，融合传统岁时美学与现代流畅交互。

[ 🇨🇳 简体中文 ](#简体中文) | [ 🇬🇧 English ](#english)

<br>

<img src="https://github.com/user-attachments/assets/08bae382-b97e-46ec-b607-42aab231c6a5" width="300" alt="岁时案台 主界面">

</div>

---
---

## 🇨🇳 简体中文

> [!warning] 📱 移动端专属说明
> 本插件专为现代智能手机（iPhone/Android）的竖屏逻辑与交互习惯进行深度定制与性能优化。
> 为了保证最佳的视觉与交互体验，**如果你在电脑、笔记本或 iPad 等宽屏设备上使用，推荐前往安装宽屏双栏专属版**：👉 [点击获取桌面/平板专属版](https://github.com/liyaomingme/obsidian-desktop-dashboard)

“将漫长岁月浓缩于一方案台。” 
这不仅仅是一个新建按钮的集合，它是你随身携带的数字日历与知识罗盘。通过极具质感的传统宋体排版、天干地支岁时历法，以及丝滑的毛玻璃弹窗，让每一次灵感的捕获都充满仪式感。

### 📸 视觉预览 (Gallery)

<div align="center">
  <img src="https://github.com/user-attachments/assets/8f3fb2dc-a8d1-40ef-a99a-2868ce2fb2ef" width="23%" alt="细节4">
  <img src="https://github.com/user-attachments/assets/bcb22080-1b84-449c-9977-982542611d4a" width="23%" alt="细节3">
  <img src="https://github.com/user-attachments/assets/1a05241f-1e16-48c0-a7b8-1d0fb43bda0a" width="23%" alt="细节2">
  <img src="https://github.com/user-attachments/assets/1a25edc5-9d80-4a9a-80b8-13686206eb5b" width="23%" alt="细节1">
</div>

### 💡 核心特性 (Features)

- **🌊 流体自适应排版 (Fluid Layout)**：利用 CSS 弹性流体网格，无论你使用窄长的安卓机还是宽大的 iPhone Pro Max，字体与日历格子均如水般自动缩放，绝不重叠、换行。
- **🛡️ 硬件级防遮挡保护**：弹窗经过精密计算，顶部预留完美安全距离，彻底避开 iPhone “灵动岛”和刘海；底部为输入法键盘留出绝对充裕的空间。
- **🕰️ 岁时印刷美学**：全局强制注入高级衬线体 (Songti SC / Noto Serif SC)。顶部引入“天干地支”农历时间轴，运用传统排版的“大小字注排法”，主副分明，极具古典品味。
- **🔍 终极日期嗅探引擎**：彻底解决 iCloud 多设备同步导致的文件创建时间丢失问题。引擎不仅读取 YAML 区，更能直接从各式各样的个人速记文件名（如 `260602`）中强行精准提取日期。
- **⚡️ 丝滑毛玻璃弹窗**：采用高级的磨砂玻璃背景 (`backdrop-filter`)，原生防闪烁动画完美契合 Obsidian 底层生命周期，呼出与退出如丝般顺滑。

### ⚙️ 安装与配置 (Installation)

**方法一：通过 BRAT 安装（推荐）**
1. 在 Obsidian 社区插件市场搜索 **Obsidian42 - BRAT** 并安装启用。
2. 进入 BRAT 设置，点击 `Add Beta plugin`。
3. 输入仓库地址：`liyaomingme/mobile-dashboard`。
4. 在第三方插件列表中启用 **Mobile Dashboard**。

**方法二：手动安装**
1. 前往本仓库的 [Releases](https://github.com/liyaomingme/mobile-dashboard/releases) 页面。
2. 下载最新版本中的 `main.js`, `manifest.json`, 和 `styles.css`。
3. 在你的 Obsidian 库的 `.obsidian/plugins/` 目录下新建文件夹 `mobile-dashboard`，并将下载的三个文件放入其中。
4. 重启 Obsidian 并启用插件。

---

## 🇬🇧 English

> [!warning] 📱 Mobile Exclusive
> This repository is strictly optimized for modern smartphones (iPhone/Android). For widescreen devices featuring a dual-column layout, please visit the desktop version: 👉 [Desktop Dashboard](https://github.com/liyaomingme/obsidian-desktop-dashboard)

"Condensing the long years into a single desk."
Welcome to the **Mobile Dashboard**! This plugin completely transforms your empty startup page into a beautiful, functional, and mobile-optimized control center, featuring traditional letterpress aesthetics and a Chinese Almanac (Bazi) axis.

### 💡 Key Features

- **🌊 Fluid Typography**: Uses dynamic CSS to scale fonts and grids based on your screen width. No text overlapping, no matter your phone's aspect ratio.
- **🛡️ Dynamic Island Safe Area**: The quick-capture modal features calculated margins to perfectly avoid the iPhone Notch/Dynamic Island, while leaving generous room for native keyboards.
- **🕰️ Almanac Aesthetics**: Forced injection of high-quality Serif/Songti fonts across all elements. Displays the traditional Chinese calendar with elegantly shrunk and subscripted "Year, Month, Day, Hour" indicators.
- **🔍 Advanced Date Parser Engine**: Solves cross-device syncing issues. Intelligently extracts dates directly from filenames, supporting extreme shorthand formats even when metadata is lost.
- **⚡️ Silky Quick Capture**: A beautifully crafted frosted-glass UI with native, flicker-free animations for smooth idea dumping.

### ⚙️ Installation

1. Install **[Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)** from the Community Plugins.
2. Go to the BRAT settings, click on **Add Beta plugin**.
3. Paste this repository path: `liyaomingme/mobile-dashboard`
4. Click **Add Plugin**, and then enable **Mobile Dashboard** in your installed plugins list.

*(For manual installation, download the latest release files and place them in your `.obsidian/plugins/mobile-dashboard` folder.)*

---

<br>

<div align="center">

### ☕ 赞赏与支持 (Sponsor)

*“把冷冰冰的代码，织成你的知识宇宙。”*

作为一名独立开发者，我试图抹平“技术”与“审美”的边界。如果“浮光拾影”为你的日常记录带来了视觉上的愉悦，或者提升了你的知识管理效率，欢迎请开发者喝杯咖啡！

你的认可是我持续打磨产品细节、对抗掉头发的最大动力。❤️

<div align="center">

<img src="https://github.com/user-attachments/assets/bf88c060-67b0-4fbd-8a7d-c0e1d850ee3d" width="260" alt="二合一赞赏码">

*( 支持使用 微信 / 支付宝 扫码 )*

**✨ 感谢你的支持与陪伴！✨**

</div>

---

### 💬 交流与反馈

欢迎加入我们的数字美学社群！遇到任何 Bug、排版错位，或是对新功能有绝妙的灵感，请带上你的 **设备型号 + Obsidian 版本号** 进行反馈。
- **GitHub Issues**: [点击提交反馈](https://github.com/liyaomingme/Obsidian-Thought-Synapse-Desktop/issues)
- **小红书同频交流**: 搜索作者 `李耀明` 获取最新插件动态与社群入口。
