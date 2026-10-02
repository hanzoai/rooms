// The gui config the rooms are typed against: @hanzo/ui's, the one every host
// mounts. A host's own registration is what its build reads; this one is what
// compiles the package.
import type { monochrome } from '@hanzo/ui/gui-config'

type Conf = typeof monochrome

declare module '@hanzogui/web' {
  interface GuiCustomConfig extends Conf {}
}

declare module '@hanzogui/core' {
  interface GuiCustomConfig extends Conf {}
}
