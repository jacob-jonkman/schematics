import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp(functions.config().firebase);
const firebaseConfig = functions.config().firebase;

// Database changes //
exports.dbWrite = functions.database.ref('/path').onWrite(event => {
    const beforeData = event.data.previous.val(); // data before the write
    const afterData = event.data.val(); // data after the write
});

exports.dbUpdate = functions.database.ref('/path').onUpdate(event => {
    const beforeData = event.data.previous.val(); // data before the update
    const afterData = event.data.val(); // data after the update
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
    const creationTime = event.data.metadata.createdAt;
    const lastSignInTime = event.data.metadata.lastSignedInAt;
});

exports.authAction2 = functions.auth.user().onCreate((event) => {
    const userMetadata = event.data.metadata;
    const creationTime = userMetadata.createdAt;
    const lastSignInTime = userMetadata.lastSignedInAt;
});

// These variable names should not be changed
exports.authAction2 = functions.auth.user().onCreate((event) => {
    const createdAt = 'some date';
    const lastSignedInAt = 'something else';
});

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
});

// Storage //
exports.processFile = functions.storage.object().onChange((event) => {
    const object = event.data;
    const filePath = object.name; // Path of the File
    const contentType = object.contentType; // Mime type of the file

    if (object.resourceState === 'not_exists') {
        console.log('This file was deleted.');
        return null;
    }
    if (object.resourceState === 'exists' && object.metageneration > 1) {
        console.log('This is a metadata change event.');
        return null;
    }
});
