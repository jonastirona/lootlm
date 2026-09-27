const ansi=/\x1b\[[0-?]*[ -/]*[@-~]/g;

export const stripAnsi=value=>String(value).replace(ansi,'');
export const visibleLength=value=>stripAnsi(value).length;
export const centerAnsi=(value,width)=>' '.repeat(Math.max(0,Math.floor((width-visibleLength(value))/2)))+value;
