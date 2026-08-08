/**
 * English strings — the canonical dictionary. `keyof typeof en` is the type
 * every other language's dictionary (and every `t()` call) is checked against,
 * so adding a key here without adding it to every other dictionary is a
 * type error, not a silent fallback.
 *
 * Exercise names, categories, equipment and targets are NOT here — they come
 * from data/exercises.json and stay English regardless of app language.
 */
export const en = {
  'common.loading': 'Loading',
  'common.reload': 'Reload',
  'common.unknownError': 'Unknown error.',
  'common.couldNotStartSession': 'Could not start the session.',
  'common.backupDownloaded': 'Backup downloaded.',
  'common.exportFailed': 'Export failed.',
  'common.never': 'Never',
  'common.unknown': 'Unknown',
  'common.today': 'today',
  'common.daysAgoOne': '-1 day',
  'common.daysAgoOther': '-{days} days',

  'tabbar.aria': 'Main',
  'tabbar.home': 'Home',
  'tabbar.exercises': 'Exercises',
  'tabbar.trainings': 'Trainings',
  'tabbar.session': 'Session',
  'tabbar.history': 'History',

  'sheet.close': 'Close',
  'sheet.cancel': 'Cancel',
  'sheet.confirmDefault': 'Confirm',

  'home.title': 'Home',
  'home.themeToDark': 'Switch to dark mode',
  'home.themeToLight': 'Switch to light mode',
  'home.errorTitle': 'Couldn’t load your data',
  'home.errorBody': 'Your data is still on the device. Reload to try again.',
  'home.weekCountOne': '{count} training this week',
  'home.weekCountOther': '{count} trainings this week',
  'home.goalPrefix': 'Goal',
  'home.goalSuffix': 'per week',
  'home.streakWeekOne': '{count} week',
  'home.streakWeekOther': '{count} weeks',
  'home.seeAllStats': 'See all stats',
  'home.seeAllStatsSub': 'Volume, consistency and muscle balance',
  'home.todaySection': 'Today',
  'home.completedToday': 'Completed today',
  'home.inProgress': 'In progress',
  'home.resumeSession': 'Resume session',
  'home.neverDone': 'Never done',
  'home.usuallyDuration': 'usually {duration}',
  'home.startSession': 'Start session',
  'home.noTrainingsYet': 'No training days yet — add one from the Trainings tab.',
  'home.goToTrainings': 'Go to Trainings',
  'home.calendarSection': 'Calendar',
  'home.backupOutdated': 'Your backup is out of date',
  'home.backupFirst': 'Back up your data',
  'home.backupBody':
    'Everything lives only on this iPhone and there is no server copy — Safari can evict it at any time. Tap to download a backup file.',
  'home.dismissBackup': 'Dismiss backup reminder',
  'home.lifetimeSessionsOne': 'session',
  'home.lifetimeSessionsOther': 'sessions',
  'home.lifetimeKgLifted': 'kg lifted',
  'home.lifetimeSince': 'since {date}',
  'home.prevMonth': 'Previous month',
  'home.nextMonth': 'Next month',

  'settings.title': 'Settings',
  'settings.weeklyGoal': 'Weekly goal',
  'settings.trainingsPerWeek': 'Trainings per week',
  'settings.decreaseGoal': 'Decrease weekly goal',
  'settings.increaseGoal': 'Increase weekly goal',
  'settings.restTimer': 'Rest timer',
  'settings.restTimerHint1':
    'Rest length is set per training day, from the bar under the session title.',
  'settings.restTimerHint2':
    'The countdown is visual. iOS Safari has no vibration, and a Home Screen app cannot send notifications, so a rest that ends while this app is in the background or the phone is locked passes silently. Android devices get a short vibration at zero.',
  'settings.language': 'Language',
  'settings.backup': 'Backup',
  'settings.exportData': 'Export data',
  'settings.lastExport': 'Last export:',
  'settings.import': 'Import',
  'settings.chooseBackupFile': 'Choose backup file',
  'settings.chooseDifferentFile': 'Choose a different file',
  'settings.merge': 'Merge',
  'settings.mergeHint':
    'Keeps what is on this device and adds the file’s records; the file wins on conflicts.',
  'settings.replace': 'Replace',
  'settings.replaceHint':
    'Deletes every training, session and custom exercise here first, then loads the file.',
  'settings.importFailed': 'That file could not be imported.',
  'settings.dataReplaced': 'Data replaced from backup.',
  'settings.backupMerged': 'Backup merged in.',
  'settings.working': 'Working',
  'settings.storage': 'Storage',
  'settings.used': 'used',
  'settings.of': 'of',
  'settings.available': 'available',
  'settings.persistUnavailable': 'Persistence status unavailable.',
  'settings.persisted': 'Storage is persisted — the browser will not evict it automatically.',
  'settings.notPersisted': 'Storage is not persisted — the browser may evict it. Keep exporting.',
  'settings.storageUnavailable': 'Storage usage is not available on this device.',
  'settings.version': 'ander-gym v{version}',
  'settings.viewSource': 'View source on GitHub',
  'settings.confirmReplaceTitle': 'Replace all data?',
  'settings.confirmReplaceMessage':
    'This deletes every training, session and custom exercise on this device and loads the backup file in their place. It cannot be undone.',
  'settings.confirmReplaceLabel': 'Replace everything',
};

export type TranslationKey = keyof typeof en;
