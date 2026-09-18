/**
 * Cookie written by the language toggle so an explicit choice on the login page wins over the
 * stored preference at sign-in. Lives outside the client component because a "use client"
 * module's exports become client references when imported from server code.
 */
export const LANGUAGE_CHOICE_COOKIE = 'portal_lang_choice';
