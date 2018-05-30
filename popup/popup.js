/**
 * @author Esphas Kueen <esphas@hotmail.com>
 * @license ISC
 */

'use strict';

/** */
class TabmentsDOM {
  /**
   * @param {Node} node
   */
  constructor(node) {
    this.base = node;
    this.groups = null;
    this.port = null;
    this.ready = false;
    // icons
    this.icons = {
      plus: '/assets/fontawesome/plus.svg',
      close: '/assets/fontawesome/times.svg',
      edit: '/assets/fontawesome/edit.svg',
      check: '/assets/fontawesome/check.svg',
      chevronRight: '/assets/fontawesome/chevron-right.svg',
    };
  }

  /** */
  async refresh() {
    if (!this.ready) {
      await this.connect();
    }
    this.clearContents(this.base);
    this.groups = document.createElement('div');
    this.groups.classList.add('groups');
    this.base.appendChild(this.groups);
    let newGroupButton = document.createElement('div');
    newGroupButton.classList.add('clickable');
    let iconNew = this.createIcon(this.icons.plus);
    newGroupButton.appendChild(iconNew);
    let textNew = this.createTitle(browser.i18n.getMessage('newGroup'));
    newGroupButton.appendChild(textNew);
    newGroupButton.addEventListener('click', () => {
      // Create new group
      let name = browser.i18n.getMessage('defaultGroupName');
      let group = this.createGroupDOM({
        name: name,
        tabs: [],
      });
      this.groups.appendChild(group);
      let onResponse = (msg) => {
        if (msg.type === 'group-response' && msg.verb === 'create') {
          group.querySelectorAll('.control-edit')[0].dispatchEvent(
            new MouseEvent('click')
          );
          this.port.onMessage.removeListener(onResponse);
        }
      };
      this.port.onMessage.addListener(onResponse);
      this.port.postMessage({
        type: 'group',
        verb: 'create',
        info: {
          name: name,
        },
      });
    });
    this.base.appendChild(newGroupButton);
    this.refreshGroups();
  }

  /** */
  async connect() {
    this.port = browser.runtime.connect({
      name: 'popup',
    });
    this.port.onMessage.addListener(this.onMessage.bind(this));
  }

  /**
   * Handles messages from background
   * @param {Message} msg
   */
  async onMessage(msg) {
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        this.refreshGroups();
        return;
      case 'tab':
        switch (msg.verb) {
          case 'create':
            await this.createTabInGroup(msg.info.index, ...msg.info.ext);
            return;
          case 'remove':
            await this.removeTabInGroup(msg.info.index, ...msg.info.ext);
            return;
          default:
            console.log('warning: unknown verb', msg);
            return;
        }
    }
  }

  /**
   * @param {number} index
   * @param {Tab} tab
   */
  async createTabInGroup(index, tab) {
    let group = this.groups.children[index];
    let tabs = group.querySelectorAll('.toggleable__list')[0];
    let tabDOM = this.createTabDOM(tab.id, tabs);
    tabs.removeChild(tabDOM);
    tabs.insertBefore(tabDOM, tabs.children[tab.index]);
  }

  /**
   * @param {number} index
   * @param {number} tabIndex
   */
  async removeTabInGroup(index, tabIndex) {
    let group = this.groups.children[index];
    if (group == null) {
      return;
    }
    let tabs = group.querySelectorAll('.toggleable__list')[0];
    tabs.removeChild(tabs.children[tabIndex]);
  }

  /** */
  async refreshGroups() {
    if (!this.ready) {
      return;
    }
    let info = await new Promise((resolve, reject) => {
      let onResponse = (msg) => {
        if (msg.type === 'info-response') {
          this.port.onMessage.removeListener(onResponse);
          resolve(msg.info);
        }
      };
      this.port.onMessage.addListener(onResponse);
      this.port.postMessage({
        type: 'info',
      });
    });
    this.clearContents(this.groups);
    for (let group of info.groups) {
      this.groups.appendChild(this.createGroupDOM(group));
    }
    this.activateGroup(info.activeIndex);
  }

  /**
   * @param {number} index
   */
  activateGroup(index) {
    let last = document.querySelector('#active-group');
    if (last) {
      last.classList.remove('toggleable--toggled');
      last.removeAttribute('id');
    }
    let active = this.groups.children[index];
    active.classList.add('toggleable--toggled');
    active.setAttribute('id', 'active-group');
  }

  /**
   * @param {Event} event
   * @return {boolean}
   */
  isGroupEvent(event) {
    let dt = event.dataTransfer;
    return [...dt.types].includes('application/x-tabments.group+json');
  }

  /**
   * @param {Event} event
   * @return {boolean}
   */
  isTabEvent(event) {
    let dt = event.dataTransfer;
    return [...dt.types].includes('application/x-tabments.tab+json');
  }

  /**
   * @param {Object} info
   * @return {Node}
   */
  createGroupDOM(info) {
    /**
     * groupDOM
     * - groupController
     * - tabs
     */
    let groupDOM = document.createElement('div');
    groupDOM.classList.add('toggleable');
    /**
     * groupController
     * - ctlToggle
     * - groupName
     * - ctlEdit
     * - ctlClose
     */
    let groupController = document.createElement('div');
    groupController.classList.add(
      'toggleable__controller',
      'group',
      'clickable'
    );
    let ctlToggle = this.createIcon(this.icons.chevronRight, '>');
    ctlToggle.classList.add('control', 'control-toggle');
    groupController.appendChild(ctlToggle);
    let groupName = this.createTitle(info.name);
    groupName.classList.add('group__name');
    groupController.appendChild(groupName);
    let ctlEdit = this.createIcon(this.icons.edit, 'I');
    ctlEdit.classList.add('control', 'control-edit');
    groupController.appendChild(ctlEdit);
    let ctlClose = this.createIcon(this.icons.close, 'X');
    ctlClose.classList.add('control', 'control-close');
    groupController.appendChild(ctlClose);
    groupDOM.appendChild(groupController);
    // create tab lists
    let tabs = document.createElement('div');
    tabs.classList.add('toggleable__list');
    for (let tabId of info.tabs) {
      tabs.appendChild(this.createTabDOM(tabId));
    }
    groupDOM.appendChild(tabs);
    // Events
    // - Toggle
    ctlToggle.addEventListener('click', (event) => {
      groupDOM.classList.toggle('toggleable--toggled');
      event.stopPropagation();
    });
    // - Edit
    let eventStopPropagation = (event) => {
      event.stopPropagation();
    };
    groupName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
      event.stopPropagation();
    });
    let handleEditBegin = (event) => {
      // Edit group name
      ctlEdit.firstChild.src = this.icons.check;
      ctlEdit.removeEventListener('click', handleEditBegin);
      ctlEdit.addEventListener('click', handleEditEnd);
      groupController.setAttribute('draggable', false);
      groupName.contentEditable = true;
      groupName.addEventListener('click', eventStopPropagation);
      groupName.focus();
      event.stopPropagation();
    };
    let handleEditEnd = (event) => {
      // Done edit
      ctlEdit.firstChild.src = this.icons.edit;
      ctlEdit.removeEventListener('click', handleEditEnd);
      ctlEdit.addEventListener('click', handleEditBegin);
      groupController.setAttribute('draggable', true);
      groupName.contentEditable = false;
      groupName.removeEventListener('click', eventStopPropagation);
      this.port.postMessage({
        type: 'group',
        verb: 'rename',
        info: {
          index: Array.from(groupDOM.parentNode.children).indexOf(groupDOM),
          name: groupName.textContent,
        },
      });
      event.stopPropagation();
    };
    ctlEdit.addEventListener('click', handleEditBegin);
    // - Close (Remove)
    ctlClose.addEventListener('click', (event) => {
      this.port.postMessage({
        type: 'group',
        verb: 'remove',
        info: {
          index: Array.from(groupDOM.parentNode.children).indexOf(groupDOM),
        },
      });
      groupDOM.parentNode.removeChild(groupDOM);
      event.stopPropagation();
    });
    // - Swtich/activate group
    groupController.addEventListener('click', () => {
      this.port.postMessage({
        type: 'group',
        verb: 'activate',
        info: {
          index: Array.from(groupDOM.parentNode.children).indexOf(groupDOM),
        },
      });
    });
    // - Drag to move
    groupController.setAttribute('draggable', true);
    groupController.addEventListener('dragstart', (event) => {
      groupDOM.parentNode.classList.add('groups--dragging');
      groupDOM.classList.add('dragged');
      event.dataTransfer.setData(
        'application/x-tabments.group+json',
        JSON.stringify({
          fromIndex: Array.from(groupDOM.parentNode.children).indexOf(groupDOM),
        })
      );
    });
    groupController.addEventListener('dragend', (event) => {
      groupDOM.parentNode.classList.remove('groups--dragging');
      groupDOM.classList.remove('dragged');
    });
    groupController.addEventListener('dragover', (event) => {
      if (this.isGroupEvent(event) || this.isTabEvent(event)) {
        event.preventDefault();
      }
    });
    groupController.addEventListener('drop', (event) => {
      if (this.isGroupEvent(event)) {
        let data = JSON.parse(event.dataTransfer.getData(
          'application/x-tabments.group+json'
        ));
        let toIndex = Array.from(
          groupDOM.parentNode.children
        ).indexOf(groupDOM);
        if (toIndex > data.fromIndex) {
          toIndex -= 1;
        }
        data.toIndex = toIndex;
        let onResponse = (msg) => {
          if (msg.type === 'group-response' && msg.verb === 'move') {
            let parent = groupDOM.parentNode;
            let moved = parent.removeChild(parent.children[data.fromIndex]);
            parent.insertBefore(moved, parent.children[data.toIndex]);
            this.port.onMessage.removeListener(onResponse);
          }
        };
        this.port.onMessage.addListener(onResponse);
        this.port.postMessage({
          type: 'group',
          verb: 'move',
          info: data,
        });
        event.preventDefault();
      } else if (this.isTabEvent(event)) {
        let data = JSON.parse(event.dataTransfer.getData(
          'application/x-tabments.tab+json'
        ));
        let toGroup = Array.from(
          groupDOM.parentNode.children
        ).indexOf(groupDOM);
        data.toGroup = toGroup;
        let onResponse = (msg) => {
          if (msg.type === 'tab-response' && msg.verb === 'move') {
            let srcGroup = groupDOM.parentNode.children[data.fromGroup];
            let srcTabs = srcGroup.querySelectorAll('.toggleable__list')[0];
            let srcTab = srcTabs.children[data.tabIndex];
            srcTabs.removeChild(srcTab);
            tabs.appendChild(srcTab);
            this.port.onMessage.removeListener(onResponse);
          }
        };
        this.port.onMessage.addListener(onResponse);
        this.port.postMessage({
          type: 'tab',
          verb: 'move',
          info: data,
        });
        event.preventDefault();
      }
    });
    return groupDOM;
  }

  /**
   * @param {number} id
   * @return {Node}
   */
  createTabDOM(id) {
    let tabDOM = document.createElement('div');
    tabDOM.classList.add('tab', 'clickable');
    browser.tabs.get(id)
      .then((tab) => {
        let favicon = this.createIcon(tab.favIconUrl, '');
        tabDOM.appendChild(favicon);
        let tabName = this.createTitle(tab.title);
        tabName.classList.add('tab__name');
        tabDOM.appendChild(tabName);
        let ctlClose = this.createIcon(this.icons.close, 'X');
        ctlClose.classList.add('control');
        tabDOM.appendChild(ctlClose);
        // Events
        // - Close/remove tab
        ctlClose.addEventListener('click', (event) => {
          browser.tabs.remove(id);
          tabDOM.parentNode.removeChild(tabDOM);
          event.stopPropagation();
        });
        // - Switch/activate tab
        tabDOM.addEventListener('click', () => {
          browser.tabs.update(id, {
            active: true,
          });
        });
        // Drag to move
        tabDOM.setAttribute('draggable', true);
        tabDOM.addEventListener('dragstart', (event) => {
          let group = tabDOM.parentNode.parentNode;
          let groups = group.parentNode;
          groups.classList.add('groups--dragging');
          event.dataTransfer.setData(
            'application/x-tabments.tab+json',
            JSON.stringify({
              fromGroup: Array.from(groups.children).indexOf(group),
              tabId: id,
              tabIndex: Array.from(tabDOM.parentNode.children).indexOf(tabDOM),
            })
          );
        });
        tabDOM.addEventListener('dragend', (event) => {
          let group = tabDOM.parentNode.parentNode;
          let groups = group.parentNode;
          groups.classList.remove('groups--dragging');
        });
      }); // Promise
    return tabDOM;
  }

  /**
   * @param {string} src
   * @param {string} alt
   * @return {Node}
   */
  createIcon(src, alt) {
    let img = document.createElement('img');
    img.setAttribute('width', 16);
    img.setAttribute('height', 16);
    img.setAttribute('src', src);
    img.setAttribute('alt', alt);
    let icon = document.createElement('span');
    icon.classList.add('icon');
    icon.appendChild(img);
    return icon;
  }

  /**
   * @param {string} str
   * @return {Node}
   */
  createTitle(str) {
    let text = document.createTextNode(str);
    let title = document.createElement('span');
    title.classList.add('title');
    title.appendChild(text);
    return title;
  }

  /**
   * Clears the content of a DOM node
   * @param {Node} node
   */
  clearContents(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }
}


const tabmentsDOM = new TabmentsDOM(tabments);

(async function() {
  await tabmentsDOM.refresh();
})();
