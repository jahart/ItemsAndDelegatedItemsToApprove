import { LightningElement, track, wire } from 'lwc'
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation'
import { loadStyle } from 'lightning/platformResourceLoader'
import { buildErrorMessage, LABELS, LocalStorage, NavHelper, ShowToast, sortData } from 'c/itemsAndDelegatedItemsToApproveUtils'
import staticResourceItems from '@salesforce/resourceUrl/ItemsAndDelegatedItemsToApprove'
import APEX_fetchMyRecordsToApprove from '@salesforce/apex/ItemsAndDelegatedItemsToApprove.fetchMyRecordsToApprove'
import APEX_shareApprovalTargetRecordWithMe from '@salesforce/apex/ItemsAndDelegatedItemsToApprove.shareApprovalTargetRecordWithMe'
import APEX_approveOrRejectItems from '@salesforce/apex/ItemsAndDelegatedItemsToApprove.approveOrRejectItems'
import APEX_lookupCustomSettings from '@salesforce/apex/ItemsAndDelegatedItemsToApprove.lookupCustomSettings'

const GLOBAL_FLEXIPAGE_CSS = staticResourceItems + '/css/GlobalFlexipageStyles.css'
const CLD_PENGUIN_URL = staticResourceItems + '/img/cld-penguin_01.png'
const VIEW_ALL_FP_URL = '/lightning/n/Items_And_Delegated_Items_To_Approve'
const COLUMN_LOCAL_STOREAGE_NAME = 'COLUMN_STOREAGE_NAME'

// note global css is used to style datatable buttons to appear as url links
const BUTTON_NAME_TO_RENDER_AS_LINK = 'datatable-button-as-link-action'


/*
 * Lightning Web Component containing logic for supporting Items and Delegated Items to Approve
 * home page component, flexipage, and mobile page
 */
export default class ItemsAndDelegatedItemsToApprove extends NavigationMixin(LightningElement) {
  cldPenguinUrl = CLD_PENGUIN_URL
  viewAllFlexipageUrl = VIEW_ALL_FP_URL
  initialSelectedRows = []

  /** when true does not allow approving multiple records */
  @track disableBulkApproveReject = false

  /** when true does not require comments when approving /  rejecting */
  @track requireComments = false

  @track label = LABELS // imported from supporting utils
  @track fetchLimit = 200
  @track fetchOffset = 0
  @track hasMore = false
  @track itemsToApprove = null
  @track itemsFetched = false //  true when items are retrieved
  @track filteredItemsToApprove = null
  @track filteredItemsSortedBy = null
  @track filteredItemsSortedByLabel = null
  @track filteredItemsSortedDirection = null

  @track customSettings = null

  // filter
  @track renderSideBarFilter = false
  @track renderSideBarColumns = false
  @track filterItemsViewOptionValue = 'showAll' // select view optin
  @track filterItemsTextValue = '' // text value to filter by
  @track filteredSobjectTypeValue = 'View All' // Selected filter sobject type value
  @track doesNotHaveSelectedRows = true // enable/disable approve and reject buttons

  // ---- columns ------
  @track baseColumnsListToRender = [ // list of all columns to render
    { label: LABELS.Related_To, include: true },
    { label: LABELS.Type, include: true },
    { label: LABELS.Most_Recent_Approver, include: true },
    { label: LABELS.Date_Submitted, include: true },
    { label: LABELS.Submitted_By, include: false },
    { label: LABELS.Assigned_By, include: false },
    { label: LABELS.Is_Delegated, include: true }
  ]
  @track dragSrc  // support column dragging / dropping

  // --  approval modal
  @track showApprovalModal = false // when true renders approval modal window!
  @track approvalModalAction
  @track approvalModalTitle = '' // title to render when approve / reject!
  @track rowSelectedWorkItem //  specific work item id!
  @track isApprove = false
  @track isReject = false
  @track isReassign = false
  @track commentsFormClass = 'slds-form-element '
  @track showApprovalWindowSpinner = false
  @track showModalWindowSpinner = false
  @track lightningDatatableIsLoading = false

  /** When true renders component for home page */
  _isHomePageComponent = false
  get isHomePageComponent() {
    return this._isHomePageComponent
  }
  /** When true renders component for flexipage */
  _isFlexiPageComponent = false
  get isFlexiPageComponent() {
    return this._isFlexiPageComponent || (!this.isMobilePageComponent && !this.isHomePageComponent)
  }
  /** When true renders component for mobile */
  _isMobilePageComponent = false
  get isMobilePageComponent() {
    return this._isMobilePageComponent
  }
  // when true hides checkbox
  get hideMultipleCheckColumn() {
    return this.disableBulkApproveReject
  }

  /*
   * Grab page reference and URL state parameters!
   */
  @wire(CurrentPageReference)
  wiredCurrentPageReference(result) {
    if (result.error) {
      ShowToast.error(this, buildErrorMessage(result.error))
    } else {
      if (result && result.type) {
        // when on home page
        if (result.type === 'standard__namedPage') {
          this._isHomePageComponent = true
        }
        // when on flexipage or mobile
        if (result.type === 'standard__navItemPage') {
          this._isHomePageComponent = false
          if (this.isMobile === true) {
            this._isMobilePageComponent = true // render mobile
          } else {
            this._isFlexiPageComponent = true // render flexipage
          }
        }
        this.fetchRecordsToApprove()
      }
    }
  }
  /*
   * grab custom settings
   */
  @wire(APEX_lookupCustomSettings)
  wiredLookupCustomSettings({ error, data }) {
    if (data && data.items && typeof  data.items.CustomSettings !== 'undefined') {
      this.customSettings = data.items.CustomSettings

      // allow or disable bulk approve / reject config
      if (typeof this.customSettings.disableBulkApproveAndReject !== 'undefined' && this.customSettings.disableBulkApproveAndReject === true) {
        this.disableBulkApproveReject = true
      }
      //  require comments config
      if (typeof this.customSettings.requireComments !== 'undefined' && this.customSettings.requireComments === true) {
        this.requireComments = true
      }
    } else if (error) {
      ShowToast.error(this, buildErrorMessage(error))
    }
  }
  /* Lifecycle hook!
   *
   * pull in our global css.
   */
  connectedCallback() {
    Promise.all([loadStyle(this, GLOBAL_FLEXIPAGE_CSS)]).then(() => {
      let elem = this.template.querySelector('.flexipage-template')
      if (typeof elem !== 'undefined' && elem !== null) {
        elem.classList.remove('slds-hide')
      }
    })

    // when on flexipage, register resize listener to provide dynamic height to the datatable
    if (this.isFlexiPageComponent) {
      window.addEventListener('resize', this.adjustDatatableContainierHeight.bind(this));
    }
  }

  /*
   * when component rendered
   */
  renderedCallback() {
    if (this.isFlexiPageComponent) {
      // when on flexipage provide dyncamic height to the datatable
      this.adjustDatatableContainierHeight()
    }
  }


  /*
   * check if browsing from mobile!
   */
  get isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  }

  /*
   * When approval item on mobile view is clicked!
   * forward to the work item record, sharing delegated
   * target object to approve with delegated approver
   */
  handleMobileActionClick(event) {
    const workItemId = event.currentTarget.dataset.workItemId
    const isDelegated = event.currentTarget.dataset.isDelegated
    this.handleDelegteActionClick(workItemId, isDelegated)
  }

  //  link to work item, sharing record with delegates
  async handleDelegteActionClick(workItemId, isDelegated) {
    if (typeof isDelegated !== 'undefined' && (isDelegated === 'true' || isDelegated === true)) {
      this.showModalWindowSpinner = true
      this.lightningDatatableIsLoading = true
      try {
        await APEX_shareApprovalTargetRecordWithMe({ workItemId: workItemId })
        NavHelper.navigateToRecord(this, workItemId)
      } catch (error) {
        ShowToast.error(this, buildErrorMessage(error))
      } finally {
        this.showModalWindowSpinner = false
        this.lightningDatatableIsLoading = false
      }
    } else {
      // not delegated, redirect to the work item
      NavHelper.navigateToRecord(this, workItemId)
    }
  }

  /*
   * Action to link to the standard process instance work item
   */
  linkToStandardItemsToApprove() {
    // TODO...MAY NEED "ITEMS TO APPROVE" LIST VIEW ID TO BE CONFIGURED!
    // @api itemsToApproveListView = ''
    NavHelper.navigateToListView(this, 'ProcessInstanceWorkitem') //, ITEMS_TO_APPROVE_LIST_VIEW)
    // NavHelper.navigateToListView(this, 'ProcessInstanceWorkitem', 'Items_to_Approve')
  }

  /*
   * handle filter button action
   * hide / show filter
   */
  toggleFilterPanel() {
    if (!this.renderSideBarFilter) { this.renderSideBarColumns = false } // close others
    this.renderSideBarFilter = !this.renderSideBarFilter
  }

  /* returns html classes for the filter panel button
   * render as brand when side bar filter is rendered
   */
  get filterPanelButtonClass() {
    return `slds-button slds-button_icon ${this.renderSideBarFilter ? ' slds-button_icon-brand' : ' slds-button_icon-border-filled '}`
  }
  /*
   * action  when columns button is clicked, show columns panel
   */
  toggleColumnPanel() {
    if (!this.renderSideBarColumns) { this.renderSideBarFilter = false } // close others
    this.renderSideBarColumns = !this.renderSideBarColumns
  }
  /* returns html classes for the column panel button
   */
  get columnPanelButtonClass() {
    return `slds-button slds-button_icon ${this.renderSideBarColumns ? ' slds-button_icon-brand' : ' slds-button_icon-border-filled '}`
  }
  /* returns true when side bar should render, false otherwise
   * sidebar should render when rendering either side bar filter or side bar columns
   */
  get renderSideBar() {
    return this.renderSideBarFilter || this.renderSideBarColumns
  }

  // ---- filter ------

  /*
   * when filter text is changed
   */
  handleFilterItemsTextChange() {
    const filterItemsText = this.template.querySelector('lightning-input.filter-items-text')
    if (typeof filterItemsText !== 'undefined') {
      this.filterItemsByText(filterItemsText.value)
    }
  }
  /*
   * returns the combobox view options
   */
  get filterItemsViewOptions() {
    return [
      { label: LABELS.Show_All_Items_To_Approve, value: 'showAll' },
      { label: LABELS.Show_Items_Delegated_To_Me, value: 'showDelegatedToMe' },
      { label: LABELS.Show_Items_Assigned_To_Me, value: 'showAssignedToMe' },
    ];
  }
  /*
   *  when filter items view option combobox is changed
   */
  handleFilterItemsViewOptions(event) {
    this.filterItemsViewOptionValue = event.detail.value
    this.filterItemsByText(this.filterItemsTextValue)
  }

  /*
   * returns unique sobject types, from items to approve for combobx to fileter by
   */
  get filterSobjectTypeOptions() {
    let data = this.itemsToApprove.map(f => { return f.sobjectType })
    data = [...new Set(data)]
    let results = [{ label: LABELS.View_All, value: 'View All' }]
    results = results.concat(data.map(r => { return { label: r, value: r } }))
    return results
  }
  /*
   * action when combobox filter option is changed
   */
  handleFilterSobjectTypeChange(event) {
    this.filteredSobjectTypeValue = event.detail.value
    this.filterItemsByText(this.filterItemsTextValue)
  }
  /*
   * applies filtering logic
   */
  filterItemsByText(textval) {
    let data = this.itemsToApprove

    this.filterItemsTextValue = textval
    let filterItemsViewOptionValue = this.filterItemsViewOptionValue || 'showAll'

    if (typeof data !== 'undefined' && data !== null) {
      // filter by items view!
      if (filterItemsViewOptionValue === 'showDelegatedToMe') {
        data = data.filter(f => { return f.isDelegated })
      } else if (filterItemsViewOptionValue === 'showAssignedToMe') {
        data = data.filter(f => { return !f.isDelegated })
      }

      // filter by sobject type when not View All!
      if (typeof this.filteredSobjectTypeValue !== 'undefined' && this.filteredSobjectTypeValue !== null && this.filteredSobjectTypeValue !== 'View All') {
        data = data.filter(f => { return f.sobjectType === this.filteredSobjectTypeValue })
      }

      // Filter specific fields by text!
      if (typeof textval !== 'undefined' && textval !== null && textval.length > 0) {
        const fieldNames = ['relatedToName', 'sobjectType', 'mostRecentApproverName', 'dateSubmitted']
        data = data.filter(f => {
          let include = false
          // check if any field contains the textvalue!
          for (let i = 0; i < fieldNames.length; i++) {
            const col = fieldNames[i]
            if (f[col].toLowerCase().indexOf(textval.toLowerCase()) > -1) {
              include = true
              break
            }
          }
          return include
        })
      }
      this.filteredItemsToApprove = data
    }
  }

  /*
   * Retrieves records to approve
   */
  async fetchRecordsToApprove() {
    try {
      this.lightningDatatableIsLoading = true
      const fetchLimit = (this._isHomePageComponent === true) ? 5 : (this.fetchLimit || 200) //  limit home page  to only 5 items
      const fetchOffset = this.fetchOffset || 0
      const auraResult = await APEX_fetchMyRecordsToApprove({ fetchLimit: fetchLimit, fetchOffset: fetchOffset })

      if (auraResult && auraResult.records && auraResult.records.length > 0) {
        this.itemsToApprove = auraResult.records.map(record => { return { ...record } }) // transform results into items to approve!
        this.itemsToApprove = typeof this.itemsToApprove !== 'undefined' && this.itemsToApprove !== null ? this.itemsToApprove : []
        this.filteredItemsToApprove = this.itemsToApprove // set a copy of itemsToApprove for page filtering / sorting!
        if (typeof this.itemsToApprove !== 'undefined' && this.itemsToApprove !== null) {
          this.sortFilteredItemsToApprove('dateSubmitted', 'asc') // initially sort data by dateSubmitted!
        }
        this.hasMore = auraResult.records.length >= this.fetchLimit
      }
    } catch (error) {
      ShowToast.error(this, buildErrorMessage(error))
    } finally {
      this.lightningDatatableIsLoading = false
      this.itemsFetched = true
    }
  }

  /**
   * Dynamically adjust datatable container
   */
  adjustDatatableContainierHeight() {
    if (this.isFlexiPageComponent) {
      let windowHeight = window.innerHeight
      let dcElem = this.template.querySelector('.datatable-container')
      let dcHeight = windowHeight > 240 ? windowHeight - 239 : windowHeight

      dcElem.style.height = `${dcHeight}px`
    }
  }

  //  ------- ------- ------- ------- -------
  //  ------- columns and drag  / drop!
  //  ------- ------- ------- ------- -------
  baseColumns = [
    // note global css is used to style this by name (button[name='datatable-button-as-link-action']) to look link a link!
    { label: LABELS.Related_To, fieldName: 'relatedToHref', initialWidth: "200px", sortable: true,
      type: "button", typeAttributes: { label: { fieldName: 'relatedToName' }, name: BUTTON_NAME_TO_RENDER_AS_LINK, title: { fieldName: 'relatedToName'} } },

    { label: LABELS.Type, fieldName: 'sobjectType', initialWidth: "150px", sortable: true, type: 'text' },
    { label: LABELS.Most_Recent_Approver, fieldName: 'mostRecentApproverHref', initialWidth: "150px", sortable: true, type: 'url', typeAttributes: { label: { fieldName: 'mostRecentApproverName' } } },
    { label: LABELS.Date_Submitted, fieldName: 'dateSubmitted', initialWidth: "150px", sortable: true, type: 'date-local' },
    { label: LABELS.Submitted_By, fieldName: 'submittedByHref', initialWidth: "150px", sortable: true, type: 'url', typeAttributes: { label: { fieldName: 'submittedByName' } } },
    { label: LABELS.Assigned_By, fieldName: 'assignedHref', initialWidth: "150px", sortable: true, type: 'url', typeAttributes: { label: { fieldName: 'assignedName' } } },
    { label: LABELS.Is_Delegated, fieldName: 'isDelegated', sortable: true, type: 'boolean', initialWidth: "50px" }
  ]

  /*
   * retrieves column list to render
   */
  get columnsListToRender() {
    let results = this.baseColumnsListToRender
    let storedResults = LocalStorage.getItemFromJSON(COLUMN_LOCAL_STOREAGE_NAME)
    if (typeof storedResults !== 'undefined') {
      results = storedResults
    }
    return results
  }

  /*
   * returns columns for our items to approve lighting datatable
   */
  get lightningDatatableApprovalColumns() {
    const columnsListToRender = this.columnsListToRender
    const baseColumns = this.baseColumns
    // build and return columns to render based on specified listing to render!
    let columns = []
    columnsListToRender.forEach(col => {
      if (col.include === true) {
        let elem = baseColumns.find(f => { return f.label === col.label })
        if (typeof elem !== 'undefined' && elem !== null) {
          columns.push(elem)
        }
      }
    })

    // inject row actions
    const actions = [{ label: LABELS.Approve, name: 'approve' },
    { label: LABELS.Reject, name: 'reject' }]
    columns.push({ type: 'action', typeAttributes: { rowActions: actions } })

    return columns
  }

  /* when column/field is checked to be included or excluded
   */
  handleIncludeCheckbox(event) {
    const targetName = event.target.fieldName || event.target.name
    const eventDetail = event.detail
    const columnsListToRender = this.columnsListToRender

    if (typeof targetName !== 'undefined' && targetName !== null) {
      let colField = columnsListToRender.find(f => { return f.label === targetName })
      if (typeof colField !== 'undefined' && colField !== null) {
        colField.include = eventDetail.checked
      }
    }

    // store updated listing to local storeage and tracked base object to re-render
    LocalStorage.setItemToJSON(COLUMN_LOCAL_STOREAGE_NAME, columnsListToRender)
    this.baseColumnsListToRender = columnsListToRender
  }

  /* when column field is dropped
   */
  onColumnFieldDrop(event) {
    const newIndex = event.currentTarget.dataset.dragIndex
    const oldIndex = event.dataTransfer.getData("text")

    event.currentTarget.classList.remove('column-over-elem') //  remove style class!

    // re-arrange listing! move element from old index to new index in list
    let data = this.columnsListToRender
    data.splice(newIndex, 0, data.splice(oldIndex, 1)[0])

    // store updated listing to local storeage and tracked base object to re-render
    LocalStorage.setItemToJSON(COLUMN_LOCAL_STOREAGE_NAME, data)
    this.baseColumnsListToRender = data
  }
  /*
   * on drag end, clear dragSrc
   */
  onColumnFieldDragEnd() {
    if (typeof this.dragSrc !== 'undefined') {
      this.dragSrc.classList.remove('column-drag-elem')
      this.dragSrc = undefined
    }
  }

  /* allow dropping
   */
  onColumnFieldAllowDrop(event) {
    if (event.preventDefault) {
      event.preventDefault() // Necessary. Allows us to drop.
    }
    if (!event.currentTarget.classList.contains('column-over-elem')) {
      event.currentTarget.classList.add('column-over-elem')
    }
    event.dataTransfer.dropEffect = 'move'  // See the section on the DataTransfer object.
    return false
  }
  /*
  */
  onColumnFieldDragLeave(event) {
    event.currentTarget.classList.remove('column-over-elem')
  }

  /* when column field is dragged */
  onColumnFieldDragStart(event) {
    const dragIndex = event.currentTarget.dataset.dragIndex

    event.dataTransfer.setData("text", dragIndex)
    event.dataTransfer.effectAllowed = 'move'

    this.dragSrc = event.currentTarget
    this.dragSrc.classList.add('column-drag-elem')
  }

  //  ------------------------------------------------------------------------
  // -- sort
  //  -------------------------------------- ---------------------------------

  /*
   * The method onsort event handler for the approval lightning data table
   */
  handleFilteredItemsSort(event) {
    this.sortFilteredItemsToApprove(event.detail.fieldName, event.detail.sortDirection)
  }
  /*
   * apply sorting logic
   */
  sortFilteredItemsToApprove(fieldName, sortDirection) {
    // maps the href columns to the named columns to use when sorting
    const hrefNameSortMap = {
      'relatedToHref': 'relatedToName',
      'mostRecentApproverHref': 'mostRecentApproverName',
      'submittedByHref': 'submittedByName',
      'assignedHref': 'assignedName',
    }
    // grab field to sort
    let sortField = fieldName

    // when field exists in the href to name sort map, use the field value to sort by
    if (hrefNameSortMap[sortField]) {
      sortField = hrefNameSortMap[sortField]
    }

    // sort the filtered items and set the sort indicators and  labels for columns
    this.filteredItemsToApprove = sortData(this.filteredItemsToApprove, sortField, sortDirection)
    this.filteredItemsSortedBy = fieldName
    this.filteredItemsSortedDirection = sortDirection
    this.filteredItemsSortedByLabel = fieldName
    // find label from columns!
    let col = this.lightningDatatableApprovalColumns.find(f => { return f.fieldName === fieldName })
    if (typeof col !== 'undefined') {
      this.filteredItemsSortedByLabel = col.label
    }
  }

  //  ------------------------------------------------------------------------
  // ---- approve / reject and modal popup
  //  ------------------------------------------------------------------------

  /**
   * Action  to render the approve or reject popup window from datatable row action
   */
  handleFilteredItemsRowAction(event) {
    event.preventDefault()
    event.stopPropagation()

    const actionName = event.detail.action.name
    const row = event.detail.row

    // when datatable-view-action clicked, redirect to work item handling delegate!
    if (actionName === BUTTON_NAME_TO_RENDER_AS_LINK) {
      const workItemId = row.workItemId
      const isDelegated = row.isDelegated
      this.handleDelegteActionClick(workItemId, isDelegated)
    } else {
      this.rowSelectedWorkItem = row
      this.showApproveRejectModal([row], actionName)
    }
  }

  /**
   * Action to Approve  or Reject all selected rows!
   */
  handleSelectedRowAction(event) {
    const targetValue = event.target.name
    const selectedRows = this.getSelectedWorkItemRows()

    this.showApproveRejectModal(selectedRows, targetValue)
  }

  /*
   * on row selection - enable / disable approve reject buttons
   */
  handleRowSelection() {
    this.doesNotHaveSelectedRows = !this.hasSelectedRows
  }

  /**
   * @return true when allowing multiple rows and at least 1 is selected
   */
  get hasSelectedRows() {
    let result = false
    if (!this.hideMultipleCheckColumn) {
      const datatable = this.template.querySelector(".appoval-datatable-container");
      const selectedWorkItemRows = typeof datatable !== 'undefined' && datatable !== null ? datatable.getSelectedRows() : []
      result = (typeof selectedWorkItemRows === 'undefined' || selectedWorkItemRows === null || selectedWorkItemRows.length <= 0) ? false : true
    }
    return result
  }

  /**
   * @return html class names to use in the approve / reject button group on flexipage
   */
  get approveRejectButtonGroupClass() {
    return `slds-button-group ${this.hideMultipleCheckColumn ? ' slds-hide' : ''}`
  }

  /**
   * Handle Approve / Reject / Reassign > button actions
   * from (menu-item on home page component)
   */
  handleApprovalAction(event) {
    const workItemId = event.currentTarget.dataset.workItemId
    const targetValue = event.target.value

    const workItem = this.itemsToApprove.find(f => { return f.workItemId === workItemId })
    this.rowSelectedWorkItem = workItem

    this.showApproveRejectModal([workItem], targetValue)
  }

  /**
   * Renders Approve or Reject modal window for specific item and action
   * shares delegated target records with current approver
   *
   * @param {workItem[]} - list of work items to approve or reject
   * @param {approvalAction} - either approve, reject, or reassign
   */
  showApproveRejectModal(workItems, approvalAction) {
    this.approvalModalAction = approvalAction
    this.isApprove = (this.approvalModalAction === 'approve' || this.approvalModalAction === 'approveAll')
    this.isReject = (this.approvalModalAction === 'reject' || this.approvalModalAction === 'rejectAll')

    // collect and share the delegated items!
    let delegatedItemPromises = []
    if (typeof workItems !== 'undefined' && workItems !== null) {
      workItems.forEach(item => {
        if (item.isDelegated) {
          delegatedItemPromises.push(APEX_shareApprovalTargetRecordWithMe({ workItemId: item.workItemId }))
        }
      })
    }
    if (delegatedItemPromises.length > 0) {
      Promise.all(delegatedItemPromises).then(() => {
        // eslint-disable-next-line
        // console.log('shared?')
      }).catch(error => {
        ShowToast.error(this, buildErrorMessage(error))
      })
    }
    this.showApprovalModal = true
  }

  /**
   * @return modal window title to render
   */
  get aprovalModalTitle() {
    let result = ''
    let rowSelectedWorkItem = this.rowSelectedWorkItem

    let titleAction = ''
    if (this.approvalModalAction.toLowerCase() === 'approve') {
      titleAction = LABELS.Approve
    } else if (this.approvalModalAction.toLowerCase() === 'reject') {
      titleAction = LABELS.Reject
    }

    if (titleAction) {
      result = `${titleAction} ${rowSelectedWorkItem ? rowSelectedWorkItem.sobjectType : LABELS.Items}`
    }
    return result
  }

  /**
   * action to cancel / close approval window
   */
  closeApprovalWindow() {
    this.showApprovalModal = false
    this.isApprove = this.isReject = this.isReassign = false
    this.approvalModalAction = this.rowSelectedWorkItem = undefined
    this.commentsFormClass = 'slds-form-element '
  }

  closeApprovalWindowAndRefresh() {
    this.closeApprovalWindow()
    this.fetchRecordsToApprove()
  }

  /**
   * Retuns the selected work items to approve or reject
   * @return {workItem[]} - a list of selected work items
   */
  getSelectedWorkItemRows() {
    let selectedWorkItemRows = []
    if (typeof this.rowSelectedWorkItem !== 'undefined' && this.rowSelectedWorkItem !== null) {
      selectedWorkItemRows.push(this.rowSelectedWorkItem)
    } else {
      const datatable = this.template.querySelector(".appoval-datatable-container")
      selectedWorkItemRows = typeof datatable !== 'undefined' && datatable !== null ? datatable.getSelectedRows() : []
    }
    return selectedWorkItemRows
  }

  /**
   * when ok / (approve / reject / reassign) is clicked on modal
   */
  async handleApprovalWindowAction() {
    const selectedWorkItem = this.getSelectedWorkItemRows()
    const approvalModalAction = this.approvalModalAction
    const commentsElem = this.template.querySelector(".textarea-id-approve-reject-comments")
    if (typeof selectedWorkItem !== 'undefined' && typeof approvalModalAction !== 'undefined') {
      if (!this.isReassign) {
        // Collect work item ids to approve or reject
        let workItemIds = selectedWorkItem.map(r => {
          return r.workItemId
        })

        let approve = approvalModalAction.toLowerCase() === 'approve' ? true : false
        let comments = commentsElem.value

        if (typeof comments === 'undefined' || comments === null || comments.trim().length <= 0) {
          // Require Comments! unless ok to not have comments
          if (this.requireComments !== false) {
            this.commentsFormClass = 'slds-form-element slds-has-error' // no comments add error!
          }
        } else {
          this.commentsFormClass = 'slds-form-element' // has comment...no error
          // approve or reject!
          try {
            this.showApprovalWindowSpinner = true
            await APEX_approveOrRejectItems({ workItemIds: workItemIds, approve: approve, comments: comments })
            this.closeApprovalWindowAndRefresh()
            // ShowToast.success(this, `Success: Record(s) ${approve ? 'Approved' : 'Rejected'}`)
          } catch (error) {
            ShowToast.error(this, buildErrorMessage(error))
          } finally {
            this.showApprovalWindowSpinner = false
          }
        }
      }
    }
  }

  /**
   * action when the comments change (remove error when comments exist)
   */
  handleCommentsChange(event) {
    let comments = event.target.value
    if (typeof comments === 'undefined' || comments === null || comments.trim().length < 0) {
      // Require Comments! unless ok to not have comments
      if (this.requireComments !== false) {
        this.commentsFormClass = 'slds-form-element slds-has-error' // no comments add error!
      }
    } else {
      this.commentsFormClass = 'slds-form-element' // comments present error class not needed
    }
  }
}