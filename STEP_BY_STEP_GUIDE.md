# 🥒 Pickle Rick: Quick Start Guide

## 1. Install & Configure

**Step 1: Install Extension**
```bash
gemini extensions install https://github.com/galz10/pickle-rick-extension
```

**Step 2: Update Settings**
Make sure both hooks and skills are enabled on Gemini CLI 
<img width="563" height="434" alt="image" src="https://github.com/user-attachments/assets/266ef79f-80cf-43fb-839b-6454dbc85afd" />

Add this to your `~/.gemini/settings.json` to enable the agent and secure git operations:
```json
{
  "context": {
    "includeDirectories": ["~/.gemini/extensions/pickle-rick"]
  },
  "tools": {
    "exclude": ["run_shell_command(git push)"],
    "allowed": [
      "run_shell_command(git commit)", 
      "run_shell_command(git add)", 
      "run_shell_command(git diff)", 
      "run_shell_command(git status)"
    ]
  }
}
```

**Step 3: Launch Safely**
Always run in sandbox mode for safety. Enabling **YOLO mode** (`-y`) prevents constant prompts for tool execution:
```bash
gemini -s -y
```

---

## 2. Choose Your Mode

| Command | Best For... |
| :--- | :--- |
| **`/pickle "task"`** | **"Shut Up and Compute"**<br>You have a clear task and don't want questions. |
| **`/pickle-prd "idea"`** | **"Collaborative Planning"**<br>You have a complex idea and want Rick to help define the requirements first. |

---

## 3. Real World Examples

### The "Quick Fix" (Use `/pickle`)
**Prompt:**
```bash
/pickle "Read this github issue [PASTE CONTENT] and apply the fix. Validate by running npm run build and npm test." 
```
**Why:** The problem and solution are clear. Rick just needs to execute.

### The "New Feature" (Use `/pickle-prd`)
**Prompt:**
```bash
/pickle-prd "I want to add ZSH-style tab completion to the CLI. If I type 'ls' and tab, show files. Validate by running npm run build and npm test." 
```
**Why:** Complex UX features have "unknowns." Rick will interrogate you to define the exact behavior before coding.

---

## 4. Controls
*   **Stop:** `/eat-pickle`
*   **Resume:** `/pickle --resume`
