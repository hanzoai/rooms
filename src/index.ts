/**
 * @hanzo/rooms — the workspace rooms, once, for every Hanzo surface.
 *
 *   import { configure, Rooms } from '@hanzo/rooms'
 *   import { Room } from '@hanzo/rooms/Room'
 *   import { CalScheduler } from '@hanzo/rooms/CalScheduler'
 *
 * The root names what a host passes; each room is its own subpath, so a page
 * loads the rooms it draws and no others.
 */
export { configure, where, site, Rooms, useRooms, useLook, useOrg } from './host'
export type { Addresses, Router, Link, RoomsProps } from './host'
