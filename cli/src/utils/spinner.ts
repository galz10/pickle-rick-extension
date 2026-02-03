import pc from "picocolors";

export class Spinner {
    private timer: Timer | null = null;
    private text: string = "";
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private frameIndex = 0;
    private isSpinning = false;

    start(text: string) {
        if (this.isSpinning) {
            this.update(text);
            return;
        }
        this.isSpinning = true;
        this.text = text;
        process.stdout.write("\x1B[?25l"); // Hide cursor
        
        // Create a new line for the spinner to live on
        process.stdout.write("\n"); 
        
        this.render();
        this.timer = setInterval(() => {
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            this.render();
        }, 80);
    }

    stop(message?: string, type: 'success' | 'error' = 'success') {
        if (!this.isSpinning) return;
        clearInterval(this.timer!);
        this.timer = null;
        this.isSpinning = false;
        
        this.clearLine();
        
        if (message) {
            const symbol = type === 'success' ? pc.green('✔') : pc.red('✖');
            process.stdout.write(`\r${symbol} ${message}\n`);
        }
        process.stdout.write("\x1B[?25h"); // Show cursor
    }

    success(text: string) {
        this.stop(text, 'success');
    }

    error(text: string) {
        this.stop(text, 'error');
    }

    update(text: string) {
        this.text = text;
    }

    printAbove(content: string) {
        if (this.isSpinning) {
            // 1. Clear the spinner line
            process.stdout.write('\r\x1B[K');
            // 2. Move cursor up to the previous line (the log line)
            process.stdout.write('\x1B[1A');
            // 3. Print content (this appends to the log line)
            process.stdout.write(content);
            
            // 4. Ensure we return to the spinner line
            if (!content.endsWith('\n')) {
                 process.stdout.write('\n');
            }
            
            // 5. Redraw spinner
            this.render();
        } else {
            // Fallback if not spinning
            process.stdout.write(content);
            if (!content.endsWith('\n')) process.stdout.write('\n');
        }
    }

    private clearLine() {
        process.stdout.write('\r\x1B[K');
    }

    private render() {
        const frame = pc.cyan(this.frames[this.frameIndex]);
        process.stdout.write(`\r${frame} ${this.text}`);
    }
}
