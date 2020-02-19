/*
 * ItemsAndDelegatedItemsToApproveTest
 *
 * Provides proofs that the Delegated Items To Approve Controller methods performs as expected
 *
 * ----------------------------------------------------------------------------
 * Date Modified    Modified By             Description of the update
 * ----------------------------------------------------------------------------
 * 15-Nov-2019      Jerry Ahart              Initial version
 */
@isTest
private class ItemsAndDelegatedItemsToApproveTest {
  static Account account;
  static User adminUser;
  static {
    account = createAccount();
    adminUser = [SELECT Id FROM User WHERE Profile.Name ='System Administrator' AND isActive = true LIMIT 1];
  }

  @isTest
  static void itFetchMyRecordsToApprove() {
    system.runAs(adminUser) {
      //Create Parent Group
      Group grp = new Group();
      grp.name = 'Test Queue';
      grp.Type = 'Queue';
      insert grp;

      //Create Group Member
      GroupMember grpMem1 = new GroupMember();
      grpMem1.UserOrGroupId = UserInfo.getUserId();
      grpMem1.GroupId = grp.Id;
      insert grpMem1;
    }

    test.startTest();

    ItemsAndDelegatedItemsToApprove.AuraResult result = ItemsAndDelegatedItemsToApprove.fetchMyRecordsToApprove(200, 0);

    // !! Use stubbed up ProcessInstance to manually build pending approval record wrappers
    ProcessInstanceWorkItem[] processInstanceWorkItems = stubManualWorkItems();
    ItemsAndDelegatedItemsToApprove.PendingApprovalRecord[] pendingApprovalRecords =  ItemsAndDelegatedItemsToApprove.buildPendingApprovalRecords(processInstanceWorkItems);

    Exception err = null;
    try {
      String str;
      str.split(',');
    } catch (Exception e) {
      err = e;
    }
    system.assertNotEquals(null, err);
    Boolean raisedAuraHandledException =  false;
    try {
      ItemsAndDelegatedItemsToApprove.raise(err);
    } catch (AuraHandledException ahe) {
      raisedAuraHandledException =  true;
    }
    system.assertEquals(true, raisedAuraHandledException, 'expected an error to have been raised');

    test.stopTest();
  }

  @isTest
  static void itSharesApprovalTargetRecordWithMe() {
    test.startTest();

    //  cover sharing work item!
    ItemsAndDelegatedItemsToApprove.AuraResult result = ItemsAndDelegatedItemsToApprove.shareApprovalTargetRecordWithMe(null);

    // !! manully cover calling the sharing extension
    Object sharedSobj1 =  ItemsAndDelegatedItemsToApprove.runSharingExtension(account.id,UserInfo.getUserId());

    // !! manuaally cover  with a configured extension!
    Database.insert(new Items_And_Delegated_Items_Settings__c(Sharing_Extension__c = 'ItemsAndDelegatedItemsToApprove.DefaultSharingExtension'));
    Object sharedSobj3 =  ItemsAndDelegatedItemsToApprove.runSharingExtension(UserInfo.getUserId(), adminUser.Id);

    test.stopTest();
  }

  @isTest
  static void itCoversApproveOrReject() {
    test.startTest();

    ItemsAndDelegatedItemsToApprove.AuraResult result = ItemsAndDelegatedItemsToApprove.approveOrRejectItems (new Id[]{account.id}, false, 'test comments');
    system.assertNotEquals(null, result);

    ItemsAndDelegatedItemsToApprove.AuraResult csResult = ItemsAndDelegatedItemsToApprove.lookupCustomSettings();
    system.assertNotEquals(null, csResult);
    system.assertNotEquals(null, csResult.items);

    ItemsAndDelegatedItemsToApprove.CustomSettings csettings = (ItemsAndDelegatedItemsToApprove.CustomSettings) csResult.items.get('CustomSettings');
    system.assertNotEquals(null, csettings);
    system.assertEquals(false, csettings.disableBulkApproveAndReject);
    system.assertEquals(false, csettings.showDelegatedItemOnly);
    system.assertEquals(false, csettings.disableSharing);
    system.assertEquals(false, csettings.requireComments);

    test.stopTest();
  }

  // Stub up a manully created process instance work item to cover building wrappers
  private static ProcessInstanceWorkItem[] stubManualWorkItems () {
    //  pi work item 1
    ProcessInstance pi1 = new ProcessInstance();
    pi1.LastActorId = UserInfo.getUserId();
    pi1.SubmittedById = UserInfo.getUserId();
    pi1.ProcessDefinition = new ProcessDefinition();
    pi1.TargetObjectId = account.id;

    ProcessInstanceWorkItem workItem1 = new ProcessInstanceWorkItem();
    workItem1.ProcessInstance = pi1;
    workItem1.ActorId = adminUser.Id;

    //  pi work item 2
    ProcessInstance pi2 = new ProcessInstance();
    pi2.SubmittedById = UserInfo.getUserId();
    pi2.ProcessDefinition = new ProcessDefinition();
    pi2.TargetObjectId = account.id;

    ProcessInstanceWorkItem workItem2 = new ProcessInstanceWorkItem();
    workItem2.ProcessInstance = pi2;
    workItem2.ActorId = UserInfo.getUserId();

    return new ProcessInstanceWorkItem[]{workItem1, workItem2};
  }

  /*** HELPER METHODS THAT CAN OFTEN BE FOUND IN UTILITY CLASS (INCLUDED HERE FOR SIMPLIFICATION) ***/
  // Create test account
  private static Account createAccount() {
    Account testAccount = new Account();
    testAccount.Name = 'Test Account ' + 138 + ' ' + '';
    insert testAccount;
    return testAccount;
  }
}