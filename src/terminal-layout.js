const ansi=/\x1b\[[0-?]*[ -/]*[@-~]/g;

export const stripAnsi=value=>String(value).replace(ansi,'');
export const visibleLength=value=>stripAnsi(value).length;
export const centerAnsi=(value,width)=>' '.repeat(Math.max(0,Math.floor((width-visibleLength(value))/2)))+value;

export function extractSgrMouseEvents(value){
 const source=String(value),events=[];
 const pattern=/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
 let match,last=0;
 while((match=pattern.exec(source))){events.push({button:Number(match[1]),x:Number(match[2]),y:Number(match[3]),kind:match[4]});last=pattern.lastIndex;}
 return {events,remainder:source.slice(last)};
}
