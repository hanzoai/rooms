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
export { configure, where, site } from './where'
export type { Addresses } from './where'
export { Rooms, Look, useRooms, useLook, useOrg } from './host'
export type { Router, Link, RoomsProps } from './host'
