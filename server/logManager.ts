import EventEmitter from "events";
import path from "path";
import fs from "fs/promises";

class LogManager extends EventEmitter {
    private logsDir: string;
    private logFile: string;

    constructor() {
        super();
        this.logsDir = path.join(__dirname, 'logs');
        this.logFile = path.join(this.logsDir, 'system.json');
    }

    public async init(): Promise<void> {//what is this form of declaration?
        try{
            await fs.access(this.logsDir)//whats is fs.access does?
            this.emit('folderCreated', this.logsDir);//whats is this.emit does?
        }catch(error){
            await fs.mkdir(this.logsDir);
            this.emit('folderCreated', this.logsDir);
        }
    }
}
export default LogManager;

// --- TEMPORARY TEST CODE ---
const myLogManager = new LogManager();

// Tune our radio to listen for the specific events
myLogManager.on('folderCreated', (path) => console.log(`[Event] Folder already existed at: ${path}`));//explain these two lines
myLogManager.on('folderReady', (path) => console.log(`[Event] Folder newly created at: ${path}`));

// Run the function
myLogManager.init();