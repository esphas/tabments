/**
 * @author Esphas Kueen <esphas@hotmail.com>
 * @license ISC
 */

'use strict';


/**
 * @typedef {string} Yuki
 *
 * @typedef {Object} StorageInfo
 * @property {Yuki} active
 * @property {[GroupInfo]} groups
 *
 * @typedef {Object} GroupInfo
 * @property {Yuki} yuki
 * @property {string} name
 * @property {Yuki} active
 * @property {[Yuki]} tabs
 */


/**
 * Generates a unique string consists only numbers and alphabets
 * @return {string}
 */
function yuki() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

/**
 * @param {number} tabId
 * @param {string} yuki
 */
async function setTabYuki(tabId, yuki) {
  await browser.sessions.setTabValue(tabId, 'yuki', yuki);
}

/**
 * @param {number} tabId
 * @return {string}
 */
async function getTabYuki(tabId) {
  return await browser.sessions.getTabValue(tabId, 'yuki');
}

/**
 * @param {string} yuki
 * @return {Promise<Tab>}
 */
async function findTabByYuki(yuki) {
  let tabs = await browser.tabs.query({});
  for (let tab of tabs) {
    let tabYuki = await browser.sessions.getTabValue(tab.id, 'yuki');
    if (yuki === tabYuki) {
      return tab;
    }
  }
  return undefined;
}


/**
 * Tabments
 * Deal with data-related works
 */
class Tabments {
  /** */
  constructor() {
    /** @private */
    this.active = 'Yuki';
    /** @private */
    this.activeIndex = 0;
    /** @private */
    this.groups = [];
    /** @readonly */
    this.ready = false;
    /** @public for communication with popup */
    this.port = null;
  }

  /**
   * Restores all neccessary data from storage and session
   */
  async restore() {
    /** @type {StorageInfo} */
    let storageInfo = await browser.storage.local.get();
    if (storageInfo.active == null) { // building
      this.activeIndex = 0;
      let group = new TabmentsGroup();
      this.groups = [group];
      await group.build();
      this.active = group.yuki;
    } else { // restoring
      this.active = storageInfo.active;
      this.groups = [];
      let all = [];
      for (let groupInfo of storageInfo.groups) {
        let group = new TabmentsGroup();
        if (this.active === groupInfo.active) {
          this.activeIndex = this.groups.length;
        }
        this.groups.push(group);
        all.push(group.restore(groupInfo));
      }
      await Promise.all(all);
    }
    // validating
    await this.validate();
    await this.store();
    this.ready = true;
  }

  /** */
  async validate() {
    // there must be at least one group
    if (this.groups.length === 0) {
      await this.createGroup();
      await this.activateGroup(0);
    }
    // this.active must point to a group
    if (this.groups.findIndex((group) => group.yuki === this.active) < 0) {
      this.active = this.groups[0].yuki;
      this.activeIndex = 0;
    }
    // all tabs must be present
    let allTabs = await browser.tabs.query({});
    let allRecorded = [].concat(
      ...this.groups.map((group) => group.tabs.map((tab) => tab.yuki))
    );
    for (let tab of allTabs) {
      let tabYuki = await getTabYuki(tab.id);
      if (!allRecorded.includes(tabYuki)) {
        this.groups[this.activeIndex].appendTab(tab);
      }
    }
    // show and hide
    let activeGroup = this.groups[this.activeIndex];
    activeGroup.show();
    for (let group of this.groups) {
      if (group.yuki !== this.active) {
        group.hide();
      }
    }
  }

  /** */
  async clearStorgage() {
    await browser.storage.local.clear();
  }

  /** */
  async store() {
    await browser.storage.local.set(JSON.parse(JSON.stringify(this)));
  }

  /**
   * @param {string} key
   * @return {StorageInfo}
   */
  toJSON(key) {
    return {
      active: this.active,
      groups: this.groups,
    };
  }

  /**
   * @param {Port} port
   */
  async addPort(port) {
    await this.store();
    this.port = port;
    this.port.onMessage.addListener(this.onMessage.bind(this));
    this.port.onDisconnect.addListener(() => tabments.removePort(port));
    this.port.postMessage({
      type: 'ready',
    });
  }

  /** */
  async removePort() {
    await this.store();
    this.port.onMessage.removeListener(this.onMessage.bind(this));
    this.port = null;
  }

  /**
   * Handles messages from popup
   * @param {Message} msg
   */
  async onMessage(msg) {
    switch (msg.type) {
      case 'info':
        let info = {};
        info.activeIndex = this.activeIndex;
        info.groups = await Promise.all(this.groups.map(async (group) => {
          let tabIds = group.tabs.map((tab) => tab.id);
          let tabs = await Promise.all(
            tabIds.map((tabId) => browser.tabs.get(tabId))
          );
          tabs.sort((a, b) => a.index > b.index);
          tabIds = tabs.map((tab) => tab.id);
          return {
            name: group.name,
            tabs: tabIds,
          };
        }));
        this.port.postMessage({
          type: 'info-response',
          info: info,
        });
        return;
      case 'group':
        switch (msg.verb) {
          case 'rename':
            await this.renameGroup(msg.info.index, msg.info.name);
            return;
          case 'create':
            await this.createGroup(msg.info.name);
            this.port.postMessage({
              type: 'group-response',
              verb: 'create',
            });
            return;
          case 'remove':
            await this.removeGroup(msg.info.index);
            return;
          case 'activate':
            await this.activateGroup(msg.info.index);
            return;
          case 'move':
            await this.moveGroup(msg.info.fromIndex, msg.info.toIndex);
            this.port.postMessage({
              type: 'group-response',
              verb: 'move',
            });
            return;
          default:
            console.log('warning: unknown verb', msg);
            return;
        }
      case 'tab':
        switch (msg.verb) {
          case 'move': // move tab across groups
            await this.transferTab(
              msg.info.tabId,
              msg.info.fromGroup,
              msg.info.toGroup
            );
            this.port.postMessage({
              type: 'tab-response',
              verb: 'move',
            });
            return;
          default:
            console.log('warning: unknown verb', msg);
            return;
        }
    }
  }

  /**
   * @param {number} index
   * @param {string} name
   */
  async renameGroup(index, name) {
    this.groups[index].name = name;
    await this.store();
  }

  /**
   * @param {string} name
   */
  async createGroup(name) {
    let group = new TabmentsGroup();
    this.groups.push(group);
    await group.restore({
      yuki: yuki(),
      name: name,
      tabs: [],
    });
    await this.store();
  }

  /**
   * @param {number} index
   */
  async removeGroup(index) {
    if (this.groups[index].yuki === this.active) {
      if (this.groups.length === 1) {
        let newGroup = new TabmentsGroup();
        this.groups.push(newGroup);
      }
      let nextActiveIndex = 0;
      if (index === 0) {
        nextActiveIndex = 1;
      }
      await this.groups[index].remove();
      await this.activateGroup(nextActiveIndex, true);
    } else {
      await this.groups[index].remove();
    }
    this.groups.splice(index, 1);
    await this.store();
  }

  /**
   * @param {number} index
   * @param {boolean} simpleMode
   */
  async activateGroup(index, simpleMode = false) {
    if (index === this.activeIndex) {
      return;
    }
    let lastActiveIndex = this.activeIndex;
    this.activeIndex = index;
    this.active = this.groups[index].yuki;
    if (simpleMode) {
      await this.groups[index].show();
    } else {
      await this.groups[lastActiveIndex].hide();
      await this.groups[index].show();
      await this.groups[lastActiveIndex].hide();
    }
    await this.store();
  }

  /**
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  async moveGroup(fromIndex, toIndex) {
    let movedGroup = this.groups.splice(fromIndex, 1);
    this.groups.splice(toIndex, 0, ...movedGroup);
    for (let i = 1; i < this.groups.length; ++i) {
      if (this.groups[i].yuki === this.active) {
        this.activeIndex = i;
        break;
      }
    }
    await this.store();
  }

  /**
   * @param {number} tabId
   * @param {number} fromGroup
   * @param {number} toGroup
   */
  async transferTab(tabId, fromGroup, toGroup) {
    let tab = this.groups[fromGroup].drop(tabId);
    this.groups[toGroup].pick(tab);
    if (toGroup === this.activeIndex) {
      await browser.tabs.show(tabId);
    } else {
      await browser.tabs.hide(tabId);
    }
    await this.store();
  }

  /** */
  async onTabActivated(...info) {
    if (await this.groups[this.activeIndex].onTabActivated(...info)) {
      await this.store();
      return;
    }
    for (let i = 0; i < this.groups.length; ++i) {
      if (await this.groups[i].onTabActivated(...info)) {
        this.activateGroup(i);
      }
    }
    await this.store();
  }

  /** */
  async onTabCreated(...info) {
    await this.groups[this.activeIndex].onTabCreated(...info);
    if (this.port) {
      this.port.postMessage({
        type: 'tab',
        verb: 'create',
        info: {
          index: this.activeIndex,
          ext: info,
        },
      });
    }
    await this.store();
  }

  /** */
  async onTabRemoved(...info) {
    let index = await this.groups[this.activeIndex].onTabRemoved(...info);
    if (this.port) {
      this.port.postMessage({
        type: 'tab',
        verb: 'remove',
        info: {
          index: this.activeIndex,
          ext: [index],
        },
      });
    }
    await this.store();
  }
}


/**
 * Tabments group
 * contains meta info and Tabments tabs
 */
class TabmentsGroup {
  /** */
  constructor() {
    /** @readonly */
    this.yuki = yuki();
    /** @public */
    this.name = '';
    /** @readonly */
    this.active = 'Yuki';
    /** @readonly */
    this.activeIndex = 0;
    /** @readonly */
    this.tabs = [];
    this.flags = {};
  }

  /** */
  async build() {
    this.name = browser.i18n.getMessage('defaultGroupName');
    this.active = 'Yuki';
    this.tabs = [];
    let tabs = await browser.tabs.query({});
    for (let tab of tabs) {
      let tabYuki = yuki();
      let ttab = new TabmentsTab(tabYuki);
      this.tabs.push(ttab);
      await setTabYuki(tab.id, tabYuki);
      await ttab.setup(tab.id);
    }
    await this.updateActive();
  }

  /**
   * @param {GroupInfo} info
   */
  async restore(info) {
    this.yuki = info.yuki;
    this.name = info.name;
    this.active = info.active;
    this.tabs = info.tabs.map((tabYuki) => new TabmentsTab(tabYuki));
    this.activeIndex = this.tabs.findIndex((tab) => tab.yuki === this.active);
    if (this.activeIndex < 0) {
      this.activeIndex = 0;
    }
    await Promise.all(this.tabs.map((tab) => tab.setup()));
  }

  /** */
  async updateActive() {
    let activeTabs = await browser.tabs.query({active: true});
    this.active = await getTabYuki(activeTabs[0].id);
    this.activeIndex = this.tabs.findIndex((tab) => tab.yuki === this.active);
    if (this.activeIndex < 0) {
      this.active = this.tabs[0].yuki;
      this.activeIndex = 0;
    }
  }

  /**
   * @param {string} key
   * @return {GroupInfo}
   */
  toJSON(key) {
    return {
      yuki: this.yuki,
      name: this.name,
      active: this.active,
      tabs: this.tabs,
    };
  }

  /** */
  async remove() {
    this.flags.destroying = true;
    await browser.tabs.remove(this.tabs.map((tab) => tab.id));
  }

  /** */
  async hide() {
    await browser.tabs.hide(this.tabs.map((tab) => tab.id));
  }

  /** */
  async show() {
    if (this.tabs.length === 0) {
      await browser.tabs.create({
        active: true,
        index: 0,
      });
    } else {
      await browser.tabs.show(this.tabs.map((tab) => tab.id));
      await browser.tabs.update(this.tabs[this.activeIndex].id, {
        active: true,
      });
    }
  }

  /**
   * @param {Tab} tab
   */
  async appendTab(tab) {
    let tabYuki = yuki();
    let ttab = new TabmentsTab(tabYuki);
    if (this.tabs.length === 0) {
      this.active = tabYuki;
      this.activeIndex = tab.index;
    }
    this.tabs.push(ttab);
    await setTabYuki(tab.id, tabYuki);
    await ttab.setup(tab.id);
  }

  /**
   * @param {number} tabId
   * @return {TabmentsTab}
   */
  drop(tabId) {
    return this.tabs.splice(
      this.tabs.findIndex((tab) => tab.id === tabId),
      1
    )[0];
  }

  /**
   * @param {TabmentsTab} tab
   */
  pick(tab) {
    this.tabs.push(tab);
    if (this.tabs.length === 1) {
      this.activeIndex = 0;
      this.active = tab.yuki;
    }
    browser.tabs.update(tab.id, {
      index: this.tabs.length - 1,
    });
  }

  /**
   * @param {Object} activeInfo
   * @return {boolean}
   */
  async onTabActivated(activeInfo) {
    let index = this.tabs.findIndex((tab) => tab.id === activeInfo.tabId);
    if (index < 0) {
      return false;
    }
    this.active = this.tabs[index].yuki;
    this.activeIndex = index;
    return true;
  }

  /**
   * @param {Tab} tab
   */
  async onTabCreated(tab) {
    this.appendTab(tab);
  }

  /**
   * @param {number} tabId
   * @param {Object} removeInfo
   * @return {number}
   */
  async onTabRemoved(tabId, removeInfo) {
    if (this.tabs.length === 1 && this.flags.destroying == null) {
      await browser.tabs.create({
        active: true,
        index: 0,
      });
    }
    let index = this.tabs.findIndex((tab) => tab.id === tabId);
    this.tabs.splice(index, 1);
    return index;
  }
}


/**
 * Tabments tab
 */
class TabmentsTab {
  /**
   * @param {Yuki} yuki
   */
  constructor(yuki) {
    /** @readonly */
    this.yuki = yuki;
    /** @readonly */
    this.id = -1;
  }

  /**
   * @param {number} id
   */
  async setup(id = null) {
    if (id == null) {
      this.id = (await findTabByYuki(this.yuki)).id;
    } else {
      this.id = id;
    }
  }

  /**
   * @param {string} key
   * @return {Yuki}
   */
  toJSON(key) {
    return this.yuki;
  }
}


const tabments = new Tabments();

(async function() {
  await tabments.restore();
  // tabs events
  browser.tabs.onActivated.addListener(
    tabments.onTabActivated.bind(tabments)
  );
  browser.tabs.onCreated.addListener(
    tabments.onTabCreated.bind(tabments)
  );
  browser.tabs.onRemoved.addListener(
    tabments.onTabRemoved.bind(tabments)
  );
  // messaging
  browser.runtime.onConnect.addListener(async (port) => {
    if (port.name === 'popup') {
      tabments.addPort(port);
    } else {
      // should not happen
      console.log(port);
    }
  });
})();
