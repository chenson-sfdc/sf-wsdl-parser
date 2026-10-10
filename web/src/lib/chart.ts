// Bar whose data-end is rounded and whose baseline end is square.
export function barPath(x: number, y: number, w: number, h: number, r: number, horizontal: boolean): string {
	if (w <= 0 || h <= 0) return '';
	r = Math.min(r, horizontal ? w : h, (horizontal ? h : w) / 2);
	if (horizontal) {
		return `M${x},${y}H${x + w - r}a${r},${r} 0 0 1 ${r},${r}V${y + h - r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
	}
	return `M${x},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},${-r}H${x + w - r}a${r},${r} 0 0 1 ${r},${r}V${y + h}Z`;
}

export function truncate(text: string, px: number, charPx = 7): string {
	const max = Math.max(4, Math.floor(px / charPx));
	return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
