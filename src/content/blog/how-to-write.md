---
title: 如何在这个博客写文章
description: 新建一个 Markdown 文件，填好标题和日期，推送到 GitHub 就会自动发布。
date: 2026-11-23
tag: 指南
---

在 `src/content/blog/` 下新建一个 `.md` 文件，文件名就是文章的网址。开头写上：

```yaml
---
title: 文章标题
description: 一两句话的摘要
date: 2026-11-24
tag: 分类
---
```

然后用 Markdown 写正文。本地预览运行 `npm run dev`，写完 `git push`，一两分钟后网站自动更新。

不想公开的文章可以加上 `draft: true`。
