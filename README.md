# Tabments

**Manage tabs with groups in a list view.**

**Notice** To use this addon, you have to turn `extensions.webextensions.tabhide.enabled` on in `about:config`! Hiding tabs is using an experimental API currently available on firefox only.

Sometimes we have too many tabs to work with, and it must be useful to have them organized into groups.

I had been using [Simplified Tab Groups](https://addons.mozilla.org/en-US/firefox/addon/tab-groups/), until firefox decided to stop support for legacy addons (since FF57), and the author decided to stop working on STG anymore.

It has been quite a while, and I finally started this project as a substitute, and actually a practice in learning javascript.

Currently it should work, though not very handy.

Note that this is **NOT** a port for STG, although quite alike.

## TODOs

- [ ] Handle multiple windows
- [ ] Tests, more tests

## Assets

The assets located in `/assets/fontawesome/` is downloaded from [Font Awesome](https://fontawesome.com/) licensed with [Font Awesome License](https://fontawesome.com/license), and a few changes are made to fit them in well.

## License

See LICENSE.

## Memo

### Consistency

- Every tab must belongs to a group;
- No group should keep invalid tab;
- A group may have 0 tabs, but when it activates, it should create a new tab in this case; when the last tab of the active group closes, create a new tab;
- There must be at least 1 group - when there is none, create 1 and add all available tabs to it (or create a new tab if none); when the last group closes, just create a new group (with a new tab), then close this one and all its tabs;

### Storage

```json
{
  "active": "Group Yuki",
  "groups": [{
    "yuki": "Group Yuki",
    "name": "Name of Group",
    "active": "Tab Yuki",
    "tabs": ["Tab Yuki"]
  }]
}
```

where the `active` indicates the active group/tab.

### Messaging

Response not included.

Messages from `background` to `body`:

- sent when setup completes (ready)
- when tabs are removed/created, sent for updating (tab)

```json
{
  "type": "tab | ready",
  "verb": "create | remove",
  "info": varied-payload
}
```

Messages from `popup` to `background`:

- sent to request information (info)
- sent to create, remove, move, rename, activate group (group)
- sent to move tab across groups (tab)

```json
{
  "type": "info | tab | group",
  "verb": "create | remove | move | rename | activate",
  "info": varied-payload
}
```
