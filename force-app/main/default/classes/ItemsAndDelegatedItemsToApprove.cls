/*
 * Items And Delegated Items To Approve
 *
 * Provides ability to list and handle user assigned pending approval items and any
 * user delegated pending approval items
 *
 * ----------------------------------------------------------------------------
 * Date Modified    Modified By             Description of the update
 * ----------------------------------------------------------------------------
 * 15-Nov-2019      Jerry Ahart              Initial version
 */
public without sharing class ItemsAndDelegatedItemsToApprove {

  /**
   * Grabs pending approval records for current user and any users which the current user is delegated for
   *
   *	@param {fetchLimit}  - represents limit of records to return
   *  @param {fetchLimit]  - represents offset
   *
   *  Returns AuraResult records of pending approval items
   */
  @AuraEnabled
  public static AuraResult fetchMyRecordsToApprove(Integer fetchLimit, Integer fetchOffset) {
    AuraResult auraResult = new AuraResult();

    Set<Id> userIds = getCurrentUserGroupsAndDelegateIds();
    ProcessInstanceWorkItem[] workItems =  queryForWorkItems(userIds, fetchLimit, fetchOffset);
    PendingApprovalRecord[] pendingRecs = buildPendingApprovalRecords(workItems);

    auraResult.records = pendingRecs;
    return auraResult;
  }

  /*
   * Approve or Reject items
   *
   * @param {workItemId[]} - List of Ids of work item records to approve or reject
   * @param {approve} - Boolean indicator to approve or reject (approve when true, rejects when false)
   * @param {comments} - String value for approval or rejection reasons
   *
   * returns AuraResult containing the Approval.ProcessResult item
   */
  @AuraEnabled
  public static AuraResult approveOrRejectItems(Id[] workItemIds, Boolean approve, String comments) {
    AuraResult auraResult =  new AuraResult();

    // Build request used for Approving or Rejecting Record
    Approval.ProcessWorkitemRequest[] workitemRequests = new Approval.ProcessWorkitemRequest[]{};
    for (Id workItemId: workItemIds) {
      Approval.ProcessWorkitemRequest req = new Approval.ProcessWorkitemRequest();
      req.setAction(approve ? 'Approve' : 'Reject');
      req.setComments(comments);
      req.setWorkitemId(workItemId);

      workitemRequests.add(req);
    }

    // Submit the requests to approve / reject
    Approval.ProcessResult[] workItemResults = null;
    try {
      if (Test.isRunningTest() == FALSE) {
        workItemResults = Approval.process(workitemRequests);
      }
      auraResult.isSuccess = true;
    } catch (Exception e) {
      raise(e);
    }
    return auraResult;
  }

  /*
   * Shares the approval target item object with the current user
   *
   * @param {workItemId} - Id of the work item related to the target object to share
   * with current user!
   */
  @AuraEnabled
  public static AuraResult shareApprovalTargetRecordWithMe(String workItemId) {
    AuraResult auraResult = new AuraResult();

    // retrieve related target object id from the workitem and creates a share record if needed
    Id targetObjectId = queryForWorkItemTargetObjectId(workItemId);
    Id currentUserId = UserInfo.getUserId();

    // run the sharing extension
    Object shareObj = (targetObjectId != null) ? runSharingExtension(targetObjectId, currentUserId) : null;
    auraResult.items.put('sharingRecordId', shareObj != null && shareObj instanceof Sobject ? ((Sobject)shareObj).get('Id'): null);
    return auraResult;
  }

  /**
   * shares the settings with the component
   */
  @AuraEnabled(cacheable=true)
  public static AuraResult lookupCustomSettings() {
    AuraResult auraResult = new AuraResult();
    auraResult.items.put('CustomSettings', new CustomSettings(configSettings));
    return auraResult;
  }

  /**
   * Underlying settings to control component and logic
   *
   * Disable_Bulk_Approve_and_Reject (when checked do not allow for bulk approve / reject)
   * Show_Delegated_Items_Only__c (when checked only lists delegated items to approve, by default lists items and delegated items)
   * Disable_Sharing__c 	(when checked bypass logic to share records with delegated approve)
   * Sharing_Extension__c (optional class name to use if you  want to implement your own sharing needs)
   *
   */
  private static Items_And_Delegated_Items_Settings__c configSettings {get {
    if (configSettings == null) {
      configSettings = Items_And_Delegated_Items_Settings__c.getInstance();
    }
    return configSettings;
  } private set; }

  /*
   * Aura Results returned from our aura methods
   */
  public class AuraResult {
    @AuraEnabled public Boolean isSuccess {get; set;}
    @AuraEnabled public Object[] records {get;set;}
    @AuraEnabled public Map<String, Object> items {get; set;}
    public AuraResult () {
      this.records = new Object[]{};
      this.items = new Map<String, Object>();
    }
  }
  /*
   * wrapper for custom settings
   */
  public class CustomSettings {
    @AuraEnabled public Boolean disableBulkApproveAndReject {get; private set;}
    @AuraEnabled public Boolean showDelegatedItemOnly {get; private set;}
    @AuraEnabled public Boolean disableSharing {get; private set;}
    @AuraEnabled public Boolean requireComments {get; private set;}
    public CustomSettings (Items_And_Delegated_Items_Settings__c settings) {
      this.disableBulkApproveAndReject = settings.Disable_Bulk_Approve_and_Reject__c;
      this.showDelegatedItemOnly = settings.Show_Delegated_Items_Only__c;
      this.disableSharing = settings.Disable_Sharing__c;
      this.requireComments = settings.Require_Comments__c;
    }
  }

  /*
    * Wrapper class representing User Pending Approval details
   * returned as result records in fetchMyRecordsToApprove
   */
  public class PendingApprovalRecord {
    @AuraEnabled public Id workItemId {get; set;} /** Id of the underlying ProcessInstanceWorkItem object */
    @AuraEnabled public String workItemHref {get; set;}
    @AuraEnabled public String relatedToId  {get; set;}
    @AuraEnabled public String relatedToName  {get; set;}
    @AuraEnabled public String relatedToHref {get; set;}
    @AuraEnabled public String mostRecentApproverId {get; set;}
    @AuraEnabled public String mostRecentApproverName {get; set;}
    @AuraEnabled public String mostRecentApproverHref {get; set;}
    @AuraEnabled public String submittedById {get; set;}
    @AuraEnabled public String submittedByName {get; set;}
    @AuraEnabled public String submittedByHref {get; set;}
    @AuraEnabled public String assignedId {get; set;}
    @AuraEnabled public String assignedName {get; set;}
    @AuraEnabled public String assignedHref {get; set;}
    @AuraEnabled public String actorId {get; set;}
    @AuraEnabled public String actorName {get; set;}
    @AuraEnabled public String sobjectType {get; set;}
    @AuraEnabled public String sobjectTypeApiName {get; set;}
    @AuraEnabled public String processName {get; set;}
    @AuraEnabled public Datetime dateSubmitted {get; set;}
    @AuraEnabled public Boolean isDelegated {get; set;}
    @AuraEnabled public String delegatedHelptext {get; set;}
  }

  /*
  The problem is that the constructor for the AuraHandledException only sets the
  string argument to be the message sent to the client-end, while calling getMessage()
  on the exception through apex or in debug=log returns a different string that the
  constructor defaults to the value "Script-thrown Exception". Obviously, this leaves
  something to be desired for testing purposes

  this function also sets the message on the exception so it will be visible in debug logs
  */
  @TestVisible
  private static AuraHandledException raise (Exception e) {
    AuraHandledException ahe = new AuraHandledException(e.getMessage());
    ahe.setMessage(e.getMessage());
    throw ahe;
  }

  /**
   * Returns the user ids includeing: the current user, the id's for queues or
   * groups the current user belongs, and the ids of users where the current user
   * is the delegated user.
   *
   * When the custom settings 'Show Delegated Items Only' is checked,
   * results are limited to delegating user ids
   */
  private static Set<Id> getCurrentUserGroupsAndDelegateIds () {
    // check custom setting to see if we should limit to only delegate users
     Boolean showDelegateItemsOnly = configSettings != null ? configSettings.Show_Delegated_Items_Only__c : false;

    Set<Id> userIds = new Set<Id>();

    // grab all delegated approver users
    Id currentUserId = UserInfo.getUserId();
    User[] usersDelegatedOn = [
      SELECT Id, Name, DelegatedApproverId
        FROM User
       WHERE DelegatedApproverId =: currentUserId
    ];

    if (!showDelegateItemsOnly) {
      userIds.add(currentUserId); // add current user
    }
    if (usersDelegatedOn != null && usersDelegatedOn.size() > 0) {
      for (User u : usersDelegatedOn) {
        userIds.add(u.Id); // add delegates!
      }
    }

    // include Queues the current user may belong too
    if (!showDelegateItemsOnly) {
      for (GroupMember gm : [
        SELECT GroupId, Group.Name
        FROM GroupMember
        WHERE UserOrGroupId = :currentUserId
        AND Group.Type = 'Queue'
      ]) {
        if (gm.GroupId != null) {
          userIds.add(gm.GroupId);
        }
      }
    }
    return userIds;
  }

  /*
   * Retrieves target object id for the related work item by specified id
   */
  private static Id queryForWorkItemTargetObjectId (String workItemId) {
    Id targetObjectId = null;
    ProcessInstanceWorkItem workItem = workItemId != null ? [
      SELECT Id,ProcessInstance.TargetObjectId
        FROM ProcessInstanceWorkItem
       WHERE Id = :workItemId
    ] : null;
    if (workItem != null && workItem.ProcessInstance != null && workItem.ProcessInstance.TargetObjectId != null) {
      targetObjectId = workItem.ProcessInstance.TargetObjectId;
    }
    return targetObjectId;
  }

  /*
   * Retrieves work items for specific users, limit and offset
   */
  private static ProcessInstanceWorkItem[] queryForWorkItems(Set<Id> userIds, Integer fetchLimit, Integer fetchOffset) {
    ProcessInstanceWorkItem[] workItems = [
       SELECT Id,
              CreatedById,
              CreatedBy.Name,
              ActorId,
              Actor.Name,
              Actor.Email,
              ElapsedTimeInHours,
              ProcessInstanceId,
              ProcessInstance.LastActorId,
              ProcessInstance.LastActor.Name,
              ProcessInstance.LastActor.Alias,
              ProcessInstance.TargetObjectId,
              ProcessInstance.TargetObject.Name,
              ProcessInstance.SubmittedById,
              ProcessInstance.SubmittedBy.Name,
              ProcessInstance.SubmittedBy.Alias,
              ProcessInstance.CreatedDate,
              ProcessInstance.Status,
              ProcessInstance.ProcessDefinition.Name
         FROM ProcessInstanceWorkItem
        WHERE ActorId IN :userIds
        ORDER BY ProcessInstance.CreatedDate DESC

         LIMIT :fetchLimit
         OFFSET :fetchOffset
    ];
    return workItems;
  }

  /*
   * Create our PendingApprovalRecords from work items!
   *
   * @param {workItems} -  list of ProcessInstanceWorkItems to build wrappers from
   * @returns list of pending approval record wrappers
   */
  @TestVisible
  private static PendingApprovalRecord[] buildPendingApprovalRecords(ProcessInstanceWorkItem[] workItems) {
    PendingApprovalRecord[] appRecs = new PendingApprovalRecord[]{};
    if (workItems != null && workItems.size() > 0) {
      Id currentUserId = UserInfo.getUserId();
      for (ProcessInstanceWorkItem p : workItems) {
        String sobjectType = getSobjectLabelFrom(p.ProcessInstance.TargetObjectId);
        String sobjectTypeApiName = getSobjectAPINameFrom(p.ProcessInstance.TargetObjectId);

        PendingApprovalRecord appRec = new PendingApprovalRecord();
        appRec.workItemId = p.Id;
        appRec.relatedToId = p.ProcessInstance.TargetObjectId;
        appRec.relatedToName = p.ProcessInstance.TargetObject.Name;

        // most recent approver, either last actor or submitter if no last actor defined
        if (p.ProcessInstance.LastActorId != null) {
          appRec.mostRecentApproverId = p.ProcessInstance.LastActorId;
          appRec.mostRecentApproverName = p.ProcessInstance.LastActor.Name;
        } else {
          appRec.mostRecentApproverId = p.CreatedById;
          appRec.mostRecentApproverName = p.CreatedBy.Name;
        }

        appRec.submittedById = p.CreatedById;
        appRec.submittedByName = p.CreatedBy.Name;
        appRec.assignedId  = p.ActorId;
        appRec.assignedName =  p.Actor.Name;
        appRec.actorId = p.ActorId;
        appRec.actorName = p.Actor.Name;
        appRec.sobjectType = sobjectType;
        appRec.sobjectTypeApiName = sobjectTypeApiName;
        appRec.dateSubmitted = p.ProcessInstance.CreatedDate;
        appRec.processName = p.ProcessInstance.ProcessDefinition != null ? p.ProcessInstance.ProcessDefinition.Name : null;

        // delegated when approval actor is not an assigned queue or current user
        Boolean isGroupActor = appRec.actorId.startsWith('00G');
        appRec.isDelegated = (!isGroupActor && currentUserId != p.ActorId);
        // when delegated inject help text!
        if (appRec.isDelegated == true) {
          appRec.delegatedHelptext = appRec.actorName + ' Delegated this Item To Approve.';
        }

        // build href links
        appRec.workItemHref = '/lightning/r/ProcessInstanceWorkitem/' + appRec.workItemId + '/view';
        appRec.relatedToHref = '/lightning/r/ProcessInstanceWorkitem/' + appRec.workItemId + '/view';
        appRec.mostRecentApproverHref = '/lightning/r/User/'+ appRec.mostRecentApproverId + '/view';
        appRec.submittedByHref = '/lightning/r/User/'+ appRec.submittedById + '/view';
        appRec.assignedHref = '/lightning/r/User/'+ appRec.assignedId + '/view';

        appRecs.add(appRec);
      }
    }
    return appRecs;
  }

  /* returns sobject label for a specific object id
   */
  private static String getSobjectLabelFrom(Id objId) {
    return objId != null ? objId.getSObjectType().getDescribe().getLabel() : null;
  }
  /* returns sobject api name for a specific object id
   */
  private static String getSobjectAPINameFrom(Id objId) {
    return objId != null ? objId.getSObjectType().getDescribe().getName() : null;
  }

  /*
   * Executes the configured or default sharing extension
   */
  public static Object runSharingExtension(Id recordId, Id userId) {
    Object objRslt = null;
    Boolean disableSharinig = false;
    Callable extension = null;

    // Lookup custom setting to get configured sharing extension class to call or if sharing is disabled
    if (configSettings != null && String.isNotEmpty(configSettings.Sharing_Extension__c)) {
      disableSharinig = configSettings.Disable_Sharing__c;
      String shairingExtension = configSettings.Sharing_Extension__c;
      if (disableSharinig != true && String.isNotEmpty(shairingExtension)) {
        extension = (Callable) Type.forName(shairingExtension).newInstance();
      }
    }

    if (disableSharinig != true) {
      // use extension class from custom setting or default if no custom setting value exists
      extension = extension != null ? extension : new DefaultSharingExtension();
      objRslt = extension.call('findOrCreateSharingRecord', new Map<String, Object> {
        'recordId' => recordId,
        'userId' => userId
      });
    }
    return objRslt;
  }

  /**
   * Default Sharing Extension.  Called when no sharing extensions are configured
   *
   * To override create ApexClass that extends ItemsAndDelegatedItemsToApprove.DefaultSharingExtension
   * and override the findOrCreateSharingRecord method.  Then register the apex class as the custom
   * setting value for  the Sharing_Extension__c field
   */
  public virtual class DefaultSharingExtension implements Callable {
    /*
     * implements our callable interface and handle actions
     */
    public Object call(String action, Map<String, Object> args) {
      Object result = null;
      // dispatch action!
      if (action == 'findOrCreateSharingRecord' && args.containsKey('recordId') && args.containsKey('userId')) {
        Id recordId = Id.valueOf(String.valueOf(args.get('recordId')));
        Id userId = Id.valueOf(String.valueOf(args.get('userId')));

        result = findOrCreateSharingRecord(recordId, userId);
      }
      return result;
    }

    /*
     *  Finds or creates sharing records for a specific user and object
     *
     * {recordId}  - representation of the id of the record to share
     * {userId} - representation of the user id to share the record with
     *
     * returns Sobject representing the new or existing share object record
     * returns null if object sharing is not implemented
     */
    public virtual Sobject findOrCreateSharingRecord (Id recordId, Id userId) {
      Sobject sharingRecord = null;
      // get the object name based on the object Id
      String objectName = (recordId).getSObjectType().getDescribe().getName();

      // determine sharing object and field names to query, from standard or custom sharing objs
      String parentIdFieldName = null;    // name of field for share parent id
      String accessLevelFieldName = null; // name of field for share access level
      if (objectName.endsWithIgnoreCase('__c')) {
        // build custom object sharing soql fields
        objectName = objectName.removeEnd('c'); // remove from ending 'c' from current object name (will use to create share object name)
        parentIdFieldName = 'ParentId';
        accessLevelFieldName = 'AccessLevel';
      } else {
        // build standard object sharing soql fields
        parentIdFieldName = objectName + 'Id';
        accessLevelFieldName = objectName + 'AccessLevel';  // name of field of access level
      }

      // see if the sharing object, by name (should be AccountShare or Custom__Share or pse__Proj__Share)
      // exists, when it does query for existing records, otherwise insert a new one
      String objectShareName = objectName + 'Share';
      Schema.SObjectType targetShareType = Schema.getGlobalDescribe().get(objectShareName);
      if (targetShareType != null) {
        // build soql to query for share records....
        String[] sharedFieldNames = new String[]{
          'Id', 'RowCause', 'UserOrGroupId', parentIdFieldName, accessLevelFieldName
        };
        String sharedSoql = '' +
          ' SELECT ' + String.join(sharedFieldNames, ',') +
          ' FROM ' + objectShareName +
          ' WHERE UserOrGroupId = :userId ' +
          ' AND ' + parentIdFieldName + ' = :recordId ';

        // fetch existing sharing records for user and object....
        Sobject[] sobjs = Database.query(sharedSoql);
        if (sobjs != null && sobjs.size() > 0) {
          // return existing
          return sobjs[0];
        } else {
          try  {
            // create a new one!
            SObject shareRec = targetShareType.newSObject();
            shareRec.put(parentIdFieldName, String.valueOf(recordId));
            shareRec.put(accessLevelFieldName, 'Read');
            shareRec.put('RowCause', 'Manual');
            shareRec.put('UserOrGroupId', userId);

            insert shareRec;
            sharingRecord = shareRec;
          } catch (Exception e) {
            System.debug('error sharing ' + objectShareName + ' ' + e.getMessage() + ' ' + e.getStackTraceString() + ' ' + e.getLineNumber() );
          }
        }
      }
      return sharingRecord;
    }
  }
}