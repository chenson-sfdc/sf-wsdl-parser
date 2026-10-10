import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			// One index.html serves every view; the view lives in the URL hash so
			// the Go file server needs no route table and back/forward still work.
			adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', strict: false }),
			router: { type: 'hash' }
		})
	],
	test: { environment: 'jsdom', include: ['src/**/*.test.ts'] }
});
