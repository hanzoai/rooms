'use client'

/**
 * @hanzo/ui, for the modules here that a server component renders.
 *
 * The package's root barrel re-exports its whole surface, and a server
 * component that reaches it registers every 'use client' module behind it as a
 * client entry of the route — 81 KB on a model page. Through this module the
 * server sees one client reference, and the client keeps only what is named.
 * Rooms are client components and import `@hanzo/ui` directly.
 */
export { Text, View } from '@hanzo/ui'
