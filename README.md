# @hanzo/rooms

The Hanzo workspace — Home, Chat, Inbox, Contacts, Meet, Cal, Drive, Board,
Work, Bots and the frame that holds them — as one package that every surface
imports.

```tsx
import { configure, Rooms } from '@hanzo/rooms'
import { Room } from '@hanzo/rooms/Room'
import { CalScheduler } from '@hanzo/rooms/CalScheduler'

configure({ site: '', home: '/home', signUp: '/signup' })

<Rooms router={router} search={search} route={route} Link={Link}>
  <Room mode="cal"><CalScheduler /></Room>
</Rooms>
```

`configure()` names the host's addresses (where its own pages live, the
gateway and IAM, the plan catalogue to paint first). `<Rooms>` carries what
moves: the router, the query, the route and the link component. The rooms
import nothing from a host, and their look comes from `@hanzo/appearance` and
`@hanzo/design` through `@hanzo/ui`.
