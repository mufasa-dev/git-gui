# 🖥️ Git GUI Tauri

A **cross-platform desktop app** for managing **Git repositories**, built with **[Tauri](https://tauri.app/)** and **[SolidJS](https://www.solidjs.com/)**, styled using **TailwindCSS**.

It provides a **modern and intuitive interface** to work with **branches, commits, staging, and remote operations** (fetch, pull, push), all without touching the terminal! ⚡

[![My Skills](https://skillicons.dev/icons?i=tauri,rust,solidjs,ts,tailwind,vscode)](https://skillicons.dev)

---

## ✨ Features

* 📂 **Open multiple repositories** and switch between them
* 🌿 **View local and remote branches**
* ⬆️⬇️ **Branch status** (ahead/behind relative to remote)
* 📝 **Commit history** for the current branch with details
* ⚡ **Stage / Unstage files** individually or in bulk
* 🗑️ **Discard changes** easily
* ✅ **Create commits** with message, description, and *amend* option
* 🌍 **Remote operations**: fetch, pull, push, merge
* 🎨 **Beautiful responsive UI** with custom animations and icons ✨

---

## 🛠️ Technologies

* [Tauri](https://tauri.app/) → Native backend + Git integration 🦀
* [SolidJS](https://www.solidjs.com/) → Reactive frontend ⚛️
* [TailwindCSS](https://tailwindcss.com/) → Fast, modern styling ✨
* [Font Awesome](https://fontawesome.com/) → Icons for fetch, pull, push, etc. 🎨

---

## 📦 Installation

### Prerequisites

* [Rust](https://www.rust-lang.org/) 🦀
* [Node.js](https://nodejs.org/) 🔥
* Git installed and available in your system `PATH`

### Steps

```bash
# Clone this repository
git clone https://github.com/mufasa-dev/git-gui.git
cd git-gui

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build the executable
npm run tauri build
```

---

## 🚀 How to use

1. Open the app 🖱️
2. Click **"Open Repository"** and select a folder containing `.git` 📂
3. Browse **branches** and check commit history and remote status 🌿
4. Use the **Local Changes** tab to stage/unstage files ⚡
5. Write your **commit message** and confirm ✅
6. Use **fetch, pull, and push** buttons to sync with remote 🌍

---

## 🖼️ Preview (mock)

> *(Em breve)* 📸

---

## 📌 Roadmap

* [ ] Show commit history with diffs 🔍
* [ ] Support multiple remotes 🌎
* [ ] Visual merge & rebase 🧩
* [ ] Git user settings ⚙️

---

## 📜 License

This project is licensed under the **MIT License** 💖
