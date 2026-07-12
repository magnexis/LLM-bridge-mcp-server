import { BridgeError } from "../api/errors.js";
export class BusyError extends BridgeError { constructor(){super("Server is busy; try again shortly.","SERVER_BUSY");} }
export class Semaphore { private active=0; constructor(private readonly limit:number){} async acquire():Promise<()=>void>{if(this.active>=this.limit)throw new BusyError();this.active++;let released=false;return()=>{if(!released){released=true;this.active--;}};} get inUse():number{return this.active;} }
