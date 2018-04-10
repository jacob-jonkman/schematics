import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

//admin.initializeApp(functions.config().firebase);
//let firebaseConfig = JSON.parse(functions.config().firebase);

// Database changes //
exports.dbWrite = functions.database.ref('/path').onWrite(event => {
    const beforeData = event.data.before.val(); // data before the write
    const afterData = event.data.after.val(); // data after the write
});

exports.dbUpdate = functions.database.ref('/path').onUpdate(event => {
    const beforeData = event.data.before.val(); // data before the update
    const afterData = event.data.after.val(); // data after the update
});

exports.dbCreate = functions.database.ref('/path').onCreate(event => {
    const createdData = event.data.val(); // data that was created
});

exports.dbDelete = functions.database.ref('/path').onDelete(event => {
    const deletedData = event.data.val(); // data that was deleted
});

exports.dbCreate = functions.database.ref('/path/{uid}').onCreate((event) => {
    const parentRef = event.data.adminRef.parent; // The Database reference to the parent authorized with admin privileges.
});

// Firestore changes //
exports.dbWrite = functions.firestore.document('/path').onWrite((event) => {
    const beforeData = event.data.previous.data(); // data before the write
    const afterData = event.data.data(); // data after the write
});
exports.dbUpdate = functions.firestore.document('/path').onUpdate((event) => {
    const beforeData = event.data.previous.data(); // data before the update
    const afterData = event.data.data(); // data after the update
});
exports.dbCreate = functions.firestore.document('/path').onCreate((event) => {
    const createdData = event.data.data(); // data that was created
});
exports.dbDelete = functions.firestore.document('/path').onDelete((event) => {
    const deletedData = event.data.data(); // data that was deleted
});

// Auth changes //
exports.authAction = functions.auth.user().onCreate((event) => {
    const creationTime = event.data.metadata.createdAt; // 2016-12-15T19:37:37.059Z
    const lastSignInTime = event.data.metadata.lastSignedInAt; // 2018-01-03T16:23:12.051Z
}

// Crashlytics //
exports.newIssue = functions.crashlytics.issue().onNewDetected((event) => {
    const issue = event.data;
    const issueId = issue.issueId;
    const issueTitle = issue.issueTitle;
    const appName = issue.appInfo.appName;
    const appId = issue.appInfo.appId;
    const appPlatform = issue.appInfo.appPlatform;
    const latestAppVersion = issue.appInfo.latestAppVersion;
    const createTime = issue.createTime;
}

// Storage //
//TODO
