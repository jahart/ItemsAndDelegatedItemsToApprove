/*
 * Items and Delegated Items To Approve supporting functions and objects
 */
import { ShowToastEvent } from 'lightning/platformShowToastEvent'
import { NavigationMixin } from 'lightning/navigation'
// labels
import Approve from '@salesforce/label/c.Approve_Label'
import Assigned_By from '@salesforce/label/c.Assigned_By'
import By_Type_To_Approve from '@salesforce/label/c.By_Type_To_Approve'
import Cancel from '@salesforce/label/c.Cancel_Label'
import Check_to_Include_Fields from '@salesforce/label/c.Check_to_Include_Fields'
import Close from '@salesforce/label/c.Close_Label'
import Comments from '@salesforce/label/c.Comments_Label'
import Date_Submitted from '@salesforce/label/c.Date_Submitted'
import Delegated_Item from '@salesforce/label/c.Delegated_Item'
import Drag_and_Drop_to_Order from '@salesforce/label/c.Drag_and_Drop_to_Order'
import Filters from '@salesforce/label/c.Filters_Label'
import Fields from '@salesforce/label/c.Fields_Label'
import Items from '@salesforce/label/c.Items_Label'
import Items_and_Delegated_Items_to_Approve from '@salesforce/label/c.Items_and_Delegated_Items_to_Approve'
import Is_Delegated from '@salesforce/label/c.Is_Delegated'
import Most_Recent_Approver from '@salesforce/label/c.Most_Recent_Approver'
import My_Approval_Requests from '@salesforce/label/c.My_Approval_Requests'
import No_approval_requests_need_your_attention_right_now from '@salesforce/label/c.No_approval_requests_need_your_attention_right_now'
import Reassign from '@salesforce/label/c.Reassign_Label'
import Reject from '@salesforce/label/c.Reject_Label'
import Refresh_to_view_the_latest_data from '@salesforce/label/c.Refresh_to_view_the_latest_data'
import Related_To from '@salesforce/label/c.Related_To'
import Settings from '@salesforce/label/c.Settings_Label'
import Show_All_Items_To_Approve from '@salesforce/label/c.Show_All_Items_To_Approve'
import Show_Approval_Items from '@salesforce/label/c.Show_Approval_Items'
import Show_Items_Assigned_To_Me from '@salesforce/label/c.Show_Items_Assigned_To_Me'
import Show_Items_Delegated_To_Me from '@salesforce/label/c.Show_Items_Delegated_To_Me'
import Sorted_By from '@salesforce/label/c.Sorted_By'
import Standard_Items_To_Approve from '@salesforce/label/c.Standard_Items_To_Approve'
import Submitted_By from '@salesforce/label/c.Submitted_By'
import Type from '@salesforce/label/c.Type_Label'
import Type_to_filter_items from '@salesforce/label/c.Type_to_filter_items'
import View_All_Items_and_Delegated_Items from '@salesforce/label/c.View_All_Items_and_Delegated_Items'
import View_All from '@salesforce/label/c.View_All'


/**
 * Reduces one or more LDS errors into a joined error message string
 * @param {FetchResponse|FetchResponse[]} errors
 * @return {String} Joined Error messages
 *
 * @example
 *    import { buildErrorMessage } from 'c/utils'
 *    let errorMessage = buildErrorMessage(exception)
 */
const buildErrorMessage = (errors) => {
  if (!Array.isArray(errors)) {
    errors = [errors];
  }
  return (
    errors
      // Remove null/undefined items
      .filter(error => !!error).map(error => {
        // UI API read errors
        if (Array.isArray(error.body)) {
          return error.body.map(e => e.message);
        }
        // UI API DML, Apex and network errors
        else if (error.body && typeof error.body.message === 'string') {
          return error.body.message;
        }
        // JS errors
        else if (typeof error.message === 'string') {
          return error.message;
        }
        // Unknown error shape so try HTTP status text
        return error.statusText;
      })
      .reduce((prev, curr) => prev.concat(curr), [])
      // Remove empty strings
      .filter(message => !!message)
      .join(' ')
  )
}

// import { ShowToastEvent } from 'lightning/platformShowToastEvent'
const ShowToast = {
  /**
   * Show a toast message for a specific instance and option
   * @param {self} - instance from calling function to show toast message in
   * @param {options} - show toast event options
   *
   * @example
   * ShowToast.message(this, {variant: 'warning', message:'warning!', mode:'dismissable'})
   */
  message(self, options) {
    self.dispatchEvent(new ShowToastEvent(options))
  },
  /**
   * Renders toast error
   * @param {self} self
   * @param {String} message
   * @param {String} mode - optional defaults to sticky
   *
   * @example
   *  ShowToast.error(this, 'BOOM!')
   */
  error(self, message, mode) {
    self.dispatchEvent(new ShowToastEvent({ variant: 'error', message: message, mode: mode || 'sticky' }))
  },
  /**
   * Renders toast success
   * @param {self} self
   * @param {String} message
   * @param {String} mode - optional defaults to dismissable
   * @example
   *  ShowToast.success(this, 'Hoopla!')
   */
  success(self, message, mode) {
    self.dispatchEvent(new ShowToastEvent({ variant: 'success', message: message, mode: mode || 'dismissable' }))
  }
}


// import { NavigationMixin } from 'lightning/navigation'
const NavHelper = {
  /**
   * Navigate to the object's Recent or specific list view.
   * @param {self} - instance from calling function that extends NavigationMixin...
   * @param {objectApiName} - API name of the standard or custom object
   * @param {listViewName} - optional target list view to use, defaults  to Recent
   */
  navigateToListView(self, objectApiName, listViewName) {
    let navlistendpoint = {
      type: 'standard__objectPage',
      attributes: {
        objectApiName: objectApiName,
        actionName: 'list'
      }
    }
    if (typeof listViewName !== 'undefined') {
      navlistendpoint.state = {
        // 'filterName' identifies the target list view.
        filterName: listViewName
      }
    }
    self[NavigationMixin.Navigate](navlistendpoint)
  },
  /**
   * Navigate to an object record
   * @param {self} - instance from calling function that extends NavigationMixin...
   * @param {recordId} - id for the object
   * @param {actionName} - optional actionName defaults to 'view'
   */
  navigateToRecord(self, recordId, actionName) {
    self[NavigationMixin.Navigate]({
      type: 'standard__recordPage',
      attributes: {
        recordId: recordId,
        actionName: actionName || 'view'
      }
    });
  }
}

const LocalStorage = {
  /**
   * Retrieves parsed value for the JSON serialized local storeage data
   * @param {String} name - key for local storeage
   * @return {Object || Object[]} JSON parsed value of the local stored item or undefined
   */
  getItemFromJSON(name) {
    let results
    if (typeof (window.localStorage) !== "undefined") {
      let storeageResults = window.localStorage.getItem(name)
      if (typeof storeageResults !== 'undefined' && storeageResults !== null) {
        results = JSON.parse(storeageResults)
      }
    } else {
      // eslint-disable-next-line
      console.log('NO STOREAGE!')
    }
    return results
  },
  /**
   * JSON Serialize the object and store to local storeage
   * @param {String} name - key for local storeage
   * @param {Object} obj - Object to JSON serialize and store
   */
  setItemToJSON(name, obj) {
    if (typeof (window.localStorage) !== "undefined") {
      window.localStorage.setItem(name, JSON.stringify(obj))
    }
  },
  /**
   * Removes item by name from local storeage
   * @param {String} name - key for local storeage
   */
  deleteItem(name) {
    if (typeof (window.localStorage) !== "undefined") {
      window.localStorage.removeItem(name);
    }
  },
  /**
   * Clears all item from local storeage
   * @param {String} name - key for local storeage
   */
  clearItems() {
    if (typeof (window.localStorage) !== "undefined") {
      window.localStorage.clearItems();
    }
  }
}

/**
 * Convenient method to sort specific array of objects by field name
 * ordering by a specific directioin
 *
 * @param {data[{}]} data
 * @param {String} fieldName
 * @param {String} sortDirection - one of 'acs' or 'desc'
 */
const sortData = (data, fieldName, sortDirection) => {
  let order = sortDirection === 'asc' ? 1 : -1
  data = typeof data !== 'undefined' && data !== null ? data : []
  data = data.slice().sort((a, b) => {
    a = a[fieldName] || ''
    b = b[fieldName] || ''
    return (a === b ? 0 : a > b ? 1 : -1) * order
  })
  return data
}

const LABELS = {
  Approve,
  Assigned_By,
  By_Type_To_Approve,
  Cancel,
  Check_to_Include_Fields,
  Close,
  Comments,
  Date_Submitted,
  Delegated_Item,
  Drag_and_Drop_to_Order,
  Fields,
  Filters,
  Items,
  Items_and_Delegated_Items_to_Approve,
  Is_Delegated,
  Most_Recent_Approver,
  My_Approval_Requests,
  No_approval_requests_need_your_attention_right_now,
  Reassign,
  Refresh_to_view_the_latest_data,
  Reject,
  Related_To,
  Settings,
  Show_All_Items_To_Approve,
  Show_Approval_Items,
  Show_Items_Assigned_To_Me,
  Show_Items_Delegated_To_Me,
  Sorted_By,
  Standard_Items_To_Approve,
  Submitted_By,
  Type,
  Type_to_filter_items,
  View_All_Items_and_Delegated_Items,
  View_All
}

export {
  buildErrorMessage,
  LABELS,
  LocalStorage,
  NavHelper,
  ShowToast,
  sortData,
}