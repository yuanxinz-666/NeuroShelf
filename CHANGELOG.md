# 更新记录

## 0.8.1 · 2026-09-08

Fix project storage selection after Windows updates. The running app now persists its own verified project location. Backup & transfer shows the active path and can reopen an existing project folder without replacing either library. An unavailable remembered folder no longer creates a fresh sample library.

- 修复独立启动时未沿用原资料路径、显示初始 PI 名单的问题。
- 软件自身保存并验证项目资料位置；新增已有资料夹打开入口。
- 原目录无法访问时明确报错，保留原资料和路径。
- 新增旧 PI 名单、关注、完整档案与论文数据的目录切换和重启回归检查。

## 0.8.0 · 2026-09-07

English and Simplified Chinese now share one Windows app. The first launch defaults to English; a user's choice persists across restarts, updates and project switches. AI response language can be selected independently, and reading guides can be translated into English in the sidebar without changing their source text. The repository now has an English homepage and bilingual user guides.

- 加入完整的中英文界面切换，首次默认英文，用户修改后保存到本机独立偏好文件。
- 重启、升级和切换项目后保留语言选择；即时切换不关闭当前页面或丢失编辑草稿。
- AI 回答语言可跟随界面，也可固定为英文或简体中文。
- 文献导读可在 AI 侧栏生成英文译文，原始导读与已有研究内容保持原样。
- 翻译导航、阅读器、实验进程、PI 档案、候选论文、提示与导出标题。
- GitHub 默认 README 改为英文，同时提供 README.zh-CN.md 和中英文使用说明。
- 新增语言持久化、失败写入、回答语言与桌面交互验证。

## 0.7.1 · 2026-09-07

本次对外发布 Windows 科研工作台，汇集项目文库、PDF 精读、PI 档案和实验进程。

- 每个项目新增实验进程：树形思维导图、步骤列表、状态、日期、目的、记录和下一步。
- 实验步骤支持图片证据、图片说明与预览，支持归档和恢复分支。
- 完整文库备份纳入实验记录和证据图片，实验进程可导出 Markdown。
- 改善编辑草稿在切换页面、项目和关闭窗口时的保存处理。
- 修复异步文库快照可能覆盖界面中较新 AI 对话的问题。
- 保留 PDF 划词空格提问、可调宽度的阅读侧栏、高亮旁注和 GPT-6 推理强度选择。
- 保留论文卡片个人评价、候选论文审核和 PI 深度档案。
- 打包验证等待 AI 流式回答完成并保存后再检查，避免将已出现的片段误判为完整结果。

公共下载仅包含程序与示例文献元数据。个人 PDF、笔记、研究记录、实验图片和账号配置均不随包分发。
