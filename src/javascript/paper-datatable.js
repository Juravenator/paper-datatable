(function () {
  'use strict';
  /* jshint eqeqeq : false */
  /*
# Paper Datatable

A [material design implementation of a data table](https://www.google.com/design/spec/components/data-tables.html).

@element paper-datatable
@demo demo/simple.html Simple clear example
@demo demo/paper-datatable.html Complex playground
   */


  Polymer({

    is: 'paper-datatable',

    properties: {
      /**
       * Read only array of all the `paper-datatable-column`'s
       *
       * @attribute _columns
       * @type Array
       */
      _columns: {
        type: Array
      },
      /**
       * Array of objects containing the data to be shown in the table.
       *
       * @attribute data
       * @type Array
       * @required
       */
      data: {
        type: Array,
        notify: true
      },
      /**
       * Whether to show checkboxes on the left to allow row selection.
       *
       * @attribute selectable
       * @type Boolean
       * @default false
       */
      selectable: {
        type: Boolean
      },
      /**
       * Whether to allow selection of more than one row.
       *
       * @attribute multiSelection
       * @type Boolean
       * @default false
       */
      multiSelection: {
        type: Boolean,
        value: false
      },
      /**
       * If `multi-selection` then this contains an array of selected row keys.
       *
       * @attribute selectedIds
       * @type Array
       * @default []
       */
      selectedKeys: {
        type: Array,
        notify: true,
        value: []
      },
      /**
       * If `multi-selection` is off then this contains the key of the selected row.
       *
       * @attribute selectedId
       * @type Object
       */
      selectedKey: {
        type: Object,
        notify: true
      },
      /**
       * If `multi-selection` is off then this contains the selected row.
       *
       * @attribute selectedId
       * @type Object
       */
      selectedItem: {
        type: Object,
        notify: true,
        computed: '_getByKey(selectedKey)'
      },
      /**
       * If `multi-selection` is on then this contains an array of the selected rows.
       *
       * @attribute selectedId
       * @type Object
       */
      selectedItems: {
        type: Array,
        notify: true,
        computed: '_getSelectedItems(selectedKeys.splices)'
      },
      _internalSortEnabled: {
        type: Boolean,
        value: false
      },
      _rowKeys: {
        type: Array
      },
      _cellInstances: {
        type: Object
      },
      /**
       * Whether to show the progress bar. As the progress bar is often not used in standalone
       * `<paper-datatable>'s the `<paper-progress>` element isn't included by default and needs to be
       * manually imported.
       *
       * @attribute progress
       * @type Boolean
       * @default false
       */
      progress: {
        type: Boolean,
        value: false
      },
      /**
       * Overflow, fixed or 'dynamic-columns'
       *
       * @attribute resizeBehavior
       * @type String
       * @default 'overflow'
       */
      resizeBehavior: {
        type: String,
        value: 'overflow',
        reflectToAttribute: true
      },
      _partialSelection: {
        type: Boolean
      },
      /**
       * The filter attribute can be used to specify a filter which will be applied to the `data`.
       * Note that selections should fully ignore filtering, and a filter only affects which data is
       * visible.
       *
       * The function takes three arguments: `item`, `key` and `items` per the JS filter function.
       *
       * For a demo please see [here](demo/filter.html).
       *
       * IMPORTANT: This is a property, not a method you should call directly.
       *
       * @attribute filter
       * @type Function
       */
      filter: {
        type: Function
      }
    },

    behaviors: [
      Polymer.IronResizableBehavior
    ],

    observers: [
      /*'restructureData(data.*, _columns.splices)',*/
      '_setRowKeys(data.splices)',
      '_notifyPathOnInstances(data.*)',
      '_linkSelectedItem(selectedKey)',
      '_linkSelectedItems(selectedKeys.splices)',
      '_setPartialSelection(selectedKeys.splices, data.*)'
    ],

    listeners: {
      'container.scroll': '_triggerDialogResize',
      'iron-resize': '_resizeListener',
      'column-property-changed': '_columnPropertyChanged'
    },

    _columnPropertyChanged: function(event, details) {
      if (this.isAttached) {
        for (var i = 0; i < this._columns.length; i++) {
          if (this._columns[i] == details.column) {
            this.set(`_columns.${i}.header`, details.column.header);
            this.set(`_columns.${i}.tooltip`, details.column.tooltip);
            this.set(`_columns.${i}.sortable`, details.column.sortable);
          }
        }
      }
    },

    ready: function() {
      this.set('_columns', []);
      this.set('selectedKeys', []);
      this._observer = Polymer.dom(this).observeNodes(function(info) {
        this._queryAndSetColumns();
        //this.processNewNodes(info.addedNodes);
        //this.processRemovedNodes(info.removedNodes);
      });
    },

    _queryAndSetColumns: function(){
      var columns = this.queryAllEffectiveChildren('paper-datatable-column');
      columns.forEach((column) => {
        if(!column.beenAttached.state.ready){
          column.parentNodeRef = this;
          this.async(function(){
            column._registerEvilFunctions();
            column.beenAttached.ready();
          });
        }
      });
      this.set('_columns', columns.filter((column) => !column.inactive));
      this.async(function(){
        this._applySortedIndicatorsToDOM();
      });
    },

    _setRowKeys: function(){
      var rowKeys = [];
      this._dataKeyCollection = Polymer.Collection.get(this.data);
      this.data.forEach(function(row){
        var key = this._dataKeyCollection.getKey(row);
        if('filter' in this){
          if(this.filter(row, key, this.data)){
            rowKeys.push(key);
          }
        }else{
          rowKeys.push(key);
        }

      }.bind(this));
      this.set("_rowKeys", rowKeys);
      //why again was this necessary?
      this._internalSort(this.get('_currentlySortedColumn'));
    },

    /**
     * If you have been changing data on the `data` property outside of the official Polymer functions
     * calling this function *may* get you the updates you want.
     */
    reload: function(){
      this._setRowKeys();
    },

    /**
     * Hardcore reset of the entire element. Sets `data` to `[]` and resets all cells.
     */
    reset: function(){
      this.set('data', []);
      this._reset();
    },

    _reset: function(){
      var cells = Polymer.dom(this.root).querySelectorAll('.bound-cell');
      cells.forEach(this._resetCell.bind(this));
      this.$.rowRepeat.render();
      Polymer.dom(this.root).querySelectorAll('#cellRepeat').forEach((cr) => cr.render());
    },

    _resetCell: function(cell){
      cell.setAttribute('data-empty', true);
      cell.removeAttribute('data-row-key');
      delete cell.dataColumn;
      delete cell.instance;
    },

    _restructureData: function(){

      this.debounce('restructure data', function(){

        var rows = Polymer.dom(this.root).querySelectorAll('tbody tr');
        // loop through the rows
        for(var rowI=0; rowI<rows.length; rowI++){
          var row = rows[rowI];
          //find the data that belongs with the row
          var rowData = this.get(['data',row.dataset.key]);

          var cells = Polymer.dom(row).querySelectorAll('.bound-cell');

          cells.forEach((cell) => {

            if(!cell.dataColumn){
              console.log(cell);
            }

            var isEmpty = cell.hasAttribute('data-empty');
            var isWrongRow = cell.getAttribute('data-row-key') !== row.dataset.key;
            var isWrongColumn = cell.dataColumn !== cell.dataBoundColumn;

            if(isEmpty || isWrongRow || isWrongColumn){
              cell.removeAttribute('data-empty');
              var prop = cell.dataColumn.property;
              var data = rowData[prop];

              cell.setAttribute('data-row-key', row.dataset.key);
              cell.dataBoundColumn = cell.dataColumn;

              if(cell.dataColumn.cellStyle.length > 0){
                cell.setAttribute('style', cell.dataColumn.cellStyle);
              }else{
                cell.setAttribute('style', '');
              }
              if(cell.style['text-align'] == '' && cell.dataColumn.align){
                cell.style['text-align'] = cell.dataColumn.align;
              }
              //if(cell.style['min-width'] == '' && cell.dataColumn.width){
              //	cell.style['min-width'] = cell.dataColumn.width;
              //}

              if(cell.dataColumn.template && !cell.dataColumn.dialog){
                var instance = cell.dataColumn._createCellInstance(
                    rowData,
                    row.dataset.key
                );
                cell.instance = instance;
                cell.instanceType = 'inline';
                cell.querySelector('span').innerHTML = '';
                cell.querySelector('span').appendChild(instance.root);
              }else{
                if(cell.instance)
                  delete cell.instance;
                cell.querySelector('span').innerHTML = cell.dataColumn._formatValue(data)
                //cell.textContent = data;
              }
            }
          });

        }
      });

    },

    _notifyPathOnInstances: function(change){
      if(change.path === 'data'){
        //not too happy about this 'hack', but it will have to do for the moment
        var cells = Polymer.dom(this.root).querySelectorAll('.bound-cell');
        if(cells.length > 0){
          cells.forEach((cell) => cell.setAttribute('data-row-key', ''));
          this._restructureData();
        }
      }
      var path = change.path.split('.');
      //console.log('_notifyPathOnInstances', path, change);
      if(path.length >= 3){
        var object = path.shift();
        var rowKey = path.shift();

        var row = Polymer.dom(this.root).querySelector('tbody tr[data-key=\''+rowKey+'\']');

        if(!row){
          console.error('critical failure');
          console.log('key', rowKey);
          return false;
        }

        var cells = row.querySelectorAll('td.bound-cell');
        for(var i=0; i<cells.length;i++){
          var cell = cells[i];
          var prop = cell.dataColumn.property;

          if(prop == path[0]){
            if(cell.instance){
              var localPath = path.slice();
              localPath.shift();
              var instanceValuePath = ['value'].concat(localPath);
              //console.info(cell, "prop column value path", instanceValuePath, "to", change.value);
              cell.instance.notifyPath(instanceValuePath, change.value);
            }
            if(!cell.instance || cell.instanceType == 'dialog'){
              cell.querySelector('span').innerHTML = this._columns[i]._formatValue(this.get([object, rowKey, prop]));
            }
          }
          if(cell.instance){
            var instancePath = ['item'].concat(path);
            cell.instance.notifyPath(instancePath, change.value, true);
          }

        }
      }
    },

    /**
     * Triggered by clicking the top left checkmark. If all are checked it will deselect all checked items.
     * If some or none are checked it will select all items
     */
    toggleAll: function(){
      var triggeredEvent = this.fire('toggle-all', {}, {cancelable: true});

      if(!triggeredEvent.defaultPrevented){
        var allChecked = this._allChecked();
        this.data.forEach(function(item){
          if(allChecked){
            this.deselect(item);
          }else{
            this.select(item);
          }
        }.bind(this));
      }
    },

    /**
     * Select the specified item. Ignore the `notify` parameter.
     *
     * @param item
     * @param Boolean [notify=false] whether to trigger a `selection-changed` event.
     */
    select: function(item, notify){
      notify = typeof notify === 'undefined' ? true : notify;

      var key = this._getKeyByItem(item);
      if(this.multiSelection){
        if(this.selectedKeys.indexOf(key) == -1){
          this.push('selectedKeys', key);
          if(notify) this.fire('selection-changed', {selected: [key]});
        }
      }else{
        this.set('selectedKey', key);
        if(notify) this.fire('selection-changed', {selected: [key]});
      }
    },

    /**
     * Deselect the specified item. Ignore the `notify` parameter.
     *
     * @param item
     * @param Boolean [notify=false] whether to trigger a `selection-changed` event.
     */
    deselect: function(item, notify){
      notify = typeof notify === 'undefined' ? true : notify;

      var key = this._getKeyByItem(item);
      if(this.multiSelection){
        var i = this.selectedKeys.indexOf(key);
        this.splice('selectedKeys', i, 1);
        if(notify) this.fire('selection-changed', {deselected: [key]});
      }else{
        if(notify) this.fire('selection-changed', {deselected: [key]});
        this.set('selectedKey', undefined);
      }
    },
    /**
     * Deselect all currently selected items. Ignore the `notify` parameter.
     */
    deselectAll: function(notify){
      if(this.multiSelection) {
        this.selectedItems.forEach(function(item){
          this.deselect(item, notify);
        }.bind(this))
      }else{
        this.deselect(this.selectedItem, notify);
      }
    },

    _allChecked: function(){
      var allChecked = true;
      this.data.forEach(function(item){
        var key = this._dataKeyCollection.getKey(item);
        if(this.selectedKeys.indexOf(key) == -1){
          allChecked = false;
        }
      }.bind(this));
      return allChecked && this.data.length > 0;
    },

    _someChecked: function(){
      return this.selectedKeys.length > 0 && !this._allChecked();
    },

    _isRowSelected: function(key){
      if(this.multiSelection){
        return this.selectedKeys.indexOf(key) > -1;
      }else{
        return this.selectedKey == key;
      }
    },

    _setSelection: function(ev){
      var key = ev.model.rowKey;
      if(ev.target.checked){
        if(this.multiSelection){
          this.push('selectedKeys', key);
          this.fire('selection-changed', {selected: [key]});
        }else{
          if(this.selectedKey){
            this.fire('selection-changed', {selected: [key], deselected: [this.selectedKey]});
          }else{
            this.fire('selection-changed', {selected: [key]});
          }
          this.selectedKey = key;
        }
      }else{
        if(this.multiSelection){
          this.splice('selectedKeys', this.selectedKeys.indexOf(key), 1);
          this.fire('selection-changed', {deselected: [key]});
        }else{
          this.fire('selection-changed', {deselected: [key]});
          this.selectedKey = null;
        }
      }
    },

    _toggleSelection: function(key){
      if(this.selectable){
        /*if(id == '__new__'){
          return false;
        }*/
        if(this.multiSelection){
          var checked = this.selectedKeys.indexOf(key) > -1;
          if(checked){
            this.splice('selectedKeys', this.selectedKeys.indexOf(key), 1);
            this.fire('selection-changed', {deselected: [key]});
          }else{
            this.push('selectedKeys', key);
            this.fire('selection-changed', {selected: [key]});
          }
        }else{
          var checked = this.selectedKey == key;
          if(checked){
            this.selectedKey = null;
            this.fire('selection-changed', {deselected: [key]});
          }else{
            if(this.selectedKey){
              this.fire('selection-changed', {selected: [key], deselected: [this.selectedKey]});
            }else{
              this.fire('selection-changed', {selected: [key]});
            }
            this.selectedKey = key;
          }
        }
      }
    },

    /**
     * Sort the specified column, where `column` is a reference to the actual `<paper-datatable-column>`
     * element.
     */
    sort: function(column){
      this.async(function(){

        var triggeredEvent = this.fire('sort', {sort: {
          property: column.property,
          direction: column.sortDirection
        }, column: column}, {cancelable: true});

        this.set('_currentlySortedColumn', column);

        this._applySortedIndicatorsToDOM();

        if(triggeredEvent.defaultPrevented){
          this._internalSortEnabled = false;
        }else{
          this._internalSortEnabled = true;
          this._internalSort(column);
        }
      });
    },

    _applySortedIndicatorsToDOM: function(){
      var previouslySortedTh = Polymer.dom(this.root).querySelector("th[data-sorted]");
      if(previouslySortedTh)
        previouslySortedTh.removeAttribute('data-sorted');

      var column = this.get('_currentlySortedColumn');

      if(column){
        var th = Polymer.dom(this.root).querySelectorAll("th").find(function(el){
          return el.dataColumn === column;
        });

        //column might have been removed or made inactive
        if(th){
          th.setAttribute('data-sorted', true);
          th.setAttribute('data-sort-direction', column.sortDirection);
        }
      }
    },

    _internalSort: function(column){
      if(this._internalSortEnabled) {
        this._rowKeys.sort(function(a, b){
          if(column.sortDirection == 'desc'){
            var c = a;
            a = b;
            b = c;
          }
          var valA = this._getByKey(a)[column.property];
          var valB = this._getByKey(b)[column.property];
          return column._sort(valA, valB);
        }.bind(this));
        this.set("_rowKeys", JSON.parse(JSON.stringify(this._rowKeys)));
      }
    },

    _handleSort: function(ev){

      var column = ev.model.column;
      if(column.sortable){
        column.set('sortDirection', column.sortDirection == 'asc' ? 'desc' : 'asc');
        column.set('sorted', true);
      }

    },

    _cellTapped: function(ev){

      var PolymerEvent = Polymer.dom(ev);
      var path = PolymerEvent.path;
      var cell;
      for(var i=0;i<path.length;i++){
        if(path[i].nodeName.toLowerCase() == 'td'){
          cell = path[i];
        }
        if(path[i].nodeName.toLowerCase() == 'tr'){
          break;
        }
      }
      var rowModel = this.$.rowRepeat.modelForElement(path[i]);

      // clicks in the checkbox cell do not have a set column
      if(ev.model.column){
        var item = this._getByKey(rowModel.rowKey);
        ev.model.column.fire('cell-tap', {key:rowModel.rowKey, item:item, target:PolymerEvent.path[0], originalEvent: ev}, {bubbles: false});
        this.fire('cell-tap', {column: ev.model.column, key:rowModel.rowKey, item:item, target:PolymerEvent.path[0], originalEvent: ev}, {});

        if(ev.model.column.dialog){
          this._initializeInDialog(cell, ev.model.column, item, rowModel.rowKey);
          var dialogInitialized = true;
        }
      }

      var triggeredEvent = this.fire('row-tap', {key: rowModel.rowKey, item: this._getByKey(rowModel.rowKey), originalEvent: ev}, {cancelable: true});
      if(!triggeredEvent.defaultPrevented && !dialogInitialized){
        if(path[0].nodeName.toLowerCase() == 'td' || (ev.model.column && !ev.model.column.editable)){
          this._toggleSelection(rowModel.rowKey);
          ev.preventDefault();
        }
      }else{
        ev.preventDefault();
      }

    },

    _initializeInDialog: function(cell, column, row, rowKey){
      var oldCell = this.$.dialog.positionedRelativeTo;
      if(oldCell){
        delete oldCell.instance;
      }
      this.$.dialog.positionedRelativeTo = cell;
      var instance = column._createCellInstance(
          row,
          rowKey
      );
      cell.instance = instance;
      cell.instanceType = 'dialog';
      Polymer.dom(this.$.dialog).innerHTML = '';
      Polymer.dom(this.$.dialog).appendChild(instance.root);
      this.$.dialog.findFocus();
      //console.log(cell.getBoundingClientRect());
    },

    _getKeyByItem: function(item){
      return this._dataKeyCollection.getKey(item);
    },

    _getByKey: function(key){
      if(key === null){
        return null;
      }
      if(typeof key === 'object'){
        return key.map(this._getByKey.bind(this));
      }
      return this.get(['data', key]);
    },

    _getSelectedItems: function(){
      return this._getByKey(this.selectedKeys);
    },

    _getIndexById: function(id){
      return console.warn('This function has been deprecated and removed.');
      /*return this.data.findIndex(function(item){
        return item[this.idProperty] == id;
      }.bind(this));*/
    },

    _numberOfColumnsPlusOne: function(){
      return this._columns.length + 1;
    },

    /**
     * Method that can be overwritten to apply a custom style to specific rows.
     *
     * IMPORTANT: This is a property, not a method you should call directly.
     */
    customRowStyle: function(rowItem){

    },

    _customRowStyle: function(rowKey){
      return this.customRowStyle(this._getByKey(rowKey));
    },

    _linkSelectedItem: function(selectedKey){
      this.linkPaths('selectedItem', 'data.'+selectedKey);
    },

    _linkSelectedItems: function(){
      var selectedItemsCollection = Polymer.Collection.get(this.selectedItems);
      selectedItemsCollection.getKeys().forEach(function(selectedItemKey, i){
        this.linkPaths('selectedItems.'+selectedItemKey, 'data.'+this.selectedKeys[i]);
      }.bind(this));
    },

    _triggerDialogResize: function(){
      this.$.dialog.setLocationRelativeTo()
    },

    _noItemsVisible: function(){
      return this._rowKeys.length === 0;
    },

    _isEqual: function(a, b){
      return a == b;
    },

    _columnsRendered: function(){
      this._resizeListener();
    },

    _setPartialSelection: function(){
      this.set('_partialSelection', this._someChecked());
    },
    _resizeListener: function(){
      this._renderTooltipsIfOverflow();
      this._setDynamicColumnsBySize();
    },
    _setDynamicColumnsBySize: function(){
      //todo: still needs to be made in to a proper property
      var padding = 28;
      var selectable = this.selectable ? 56 : 0;
      if(this.resizeBehavior == 'dynamic-columns'){
        var allColumns = this.queryAllEffectiveChildren('paper-datatable-column');

        if(allColumns.length > 0) {
          var maxWidth = this.$.container.clientWidth;

          allColumns.sort(function (a, b) {
            if(a.resizePriority === -1 && b.resizePriority === -1){
              return 0;
            }else if(a.resizePriority === -1){
              return -1;
            }else if(b.resizePriority === -1){
              return 1;
            }
            return b.resizePriority - a.resizePriority;
          });

          var widthSoFar = selectable - 2 * padding;
          allColumns.forEach(function (column) {
            if(!column.width){
              console.error('For dynamic columns to work you have to set the `width` attribute of every column.');
            }
            widthSoFar += parseFloat(column.width) + padding * 2;
            if (widthSoFar > maxWidth && column.resizePriority !== -1) {
              column.set('inactive', true);
            } else {
              column.set('inactive', false);
            }
          });
        }
      }
    },
    _renderTooltipsIfOverflow: function(){
      if(this.resizeBehavior == 'fixed'){
        if(this._columns.length > 0){

          var ths = Polymer.dom(this.root).querySelectorAll('th');
          ths.forEach((th) => {
            if(th.dataColumn){
              var column = th.dataColumn;
              if(th.scrollWidth > th.offsetWidth){
                column.set('tooltip', column.header);
              }else{
                column.set('tooltip', '');
              }
            }
          });

        }
      }
    }

  });
})();
