import { format } from 'd3-format';

export const fmtInt = format(',d');

export const plural = (n: number, one: string, many = one + 's') => `${fmtInt(n)} ${n === 1 ? one : many}`;
