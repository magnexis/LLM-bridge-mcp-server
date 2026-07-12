import type { Provider } from "../config.js";
export interface ProviderCapabilities { text:boolean; vision:boolean; toolCalling:boolean; structuredOutput:boolean; numericReasoningBudget:boolean; thinkingToggle:boolean; streaming:boolean; }
export const capabilitiesFor=(provider:Provider):ProviderCapabilities => provider==="openrouter" ? {text:true,vision:true,toolCalling:true,structuredOutput:true,numericReasoningBudget:true,thinkingToggle:true,streaming:true} : {text:true,vision:true,toolCalling:true,structuredOutput:true,numericReasoningBudget:false,thinkingToggle:true,streaming:false};
export function requireCapability(c:ProviderCapabilities,key:keyof ProviderCapabilities,label:string):void { if(!c[key]) throw new Error(`Configured provider does not support ${label}.`); }
