const ranks={starter:1,bust:1,common:2,specialist:3,rare:3,epic:4,legendary:5,mythic:6,uncommon:2,strong:4};
const multipliers=[0,1,1,1.25,2,3,5];

export const showcaseWeight=entry=>multipliers[ranks[entry?.tier]||1];

function weightedPick(entries,random){
 const total=entries.reduce((sum,entry)=>sum+showcaseWeight(entry),0);
 let target=random()*total;
 for(const entry of entries){target-=showcaseWeight(entry);if(target<0)return entry;}
 return entries.at(-1);
}

export function shuffleModels(entries,random=Math.random){
 const result=[...entries];
 for(let index=result.length-1;index>0;index--){const swap=Math.floor(random()*(index+1));[result[index],result[swap]]=[result[swap],result[index]];}
 return result;
}

export function buildShowcaseReel(entries,winner,{length=78,landing=75,random=Math.random}={}){
 const pool=entries.length?entries:[winner];
 const reel=[];
 for(let index=0;index<length;index++){
  let choice=weightedPick(pool,random);
  for(let retry=0;retry<4&&pool.length>1&&choice?.model===reel.at(-1)?.model;retry++)choice=weightedPick(pool,random);
  if(pool.length>1&&choice?.model===reel.at(-1)?.model)choice=weightedPick(pool.filter(entry=>entry.model!==reel.at(-1).model),random);
  reel.push(choice);
 }
 const safeLanding=Math.max(2,Math.min(landing,reel.length-3));
 reel[safeLanding]=winner;
 const rareTeases=pool.filter(entry=>(ranks[entry.tier]||1)>=4&&entry.model!==winner.model&&entry.model!==reel[safeLanding-2]?.model);
 if(rareTeases.length)reel[safeLanding-1]=weightedPick(rareTeases,random);
 return {reel,landing:safeLanding};
}
