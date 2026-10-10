import { goto } from '$app/navigation';

// Views are addressed by hash (see the router setting), e.g. #/objects?o=Account.
export const objectHref = (name: string) => `#/objects?o=${encodeURIComponent(name)}`;
export const openObject = (name: string) => goto(objectHref(name));

// Under hash routing the query string lives inside the hash (after the route),
// not in url.search — url.pathname is always "/" and url.searchParams is
// always empty. Pull the query back out of the hash fragment instead.
export function hashQuery(url: { hash: string }): URLSearchParams {
	return new URLSearchParams(url.hash.split('?')[1] ?? '');
}
