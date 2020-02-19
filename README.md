## Items and Delegated Items to Approve

Lightning Web Components and Apex to provide an optional replacement or companion to the salesforce standard items to approve component.

* Lists items and delegated items to approve.
* Allows for bulk approval or rejection of items.
* Supports creation of sharing records between the delegated user and delegated record to approve.

## Custom Settings

* __Disable Bulk Approve and Reject__ - When checked disables bulk approving and rejecting items.

* __Disable Sharing__  - When checked bypasses the logic to share the record to approve with the delegated user.

* __Require Comments__ - When checked requires comments to approve or reject items

* __Show Delegated Items Only__ - When checked limits approval items to only delegated items.

* __Sharing Extension__ - Optional apex class name to run which handles specific sharing logic needs. @see ItemsAndDelegatedItemsToApprove.DefaultSharingExtension

