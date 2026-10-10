export type TipLine = string | { value: string; label: string };

class Tip {
	lines = $state.raw<TipLine[] | null>(null);
	x = $state(0);
	y = $state(0);

	show(e: { clientX: number; clientY: number }, lines: TipLine[]) {
		this.lines = lines;
		this.move(e);
	}
	move(e: { clientX: number; clientY: number }) {
		this.x = e.clientX;
		this.y = e.clientY;
	}
	hide() {
		this.lines = null;
	}
}

export const tip = new Tip();
