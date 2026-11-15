import {estimateEquityWork,runEquity,type EquityInput} from "./poker/labEquity.ts";
const scope=self as unknown as {onmessage:((event:MessageEvent<{type:"estimate"|"run";input:EquityInput}>)=>void)|null;postMessage:(data:unknown)=>void};
scope.onmessage=async({data})=>{
  try{
    if(data.type==="estimate"){scope.postMessage({type:"estimate",data:estimateEquityWork(data.input)});return;}
    const result=await runEquity(data.input,{progress:(point,total)=>scope.postMessage({type:"progress",point,total})});
    scope.postMessage({type:"result",data:result});
  }catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"Cálculo recusado."});}
};
