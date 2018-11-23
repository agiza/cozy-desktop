/* @flow */

/** An identity conflict is a conflict where two files/dirs can coexist on the
 * remote side but not on the local one because they would be considered the
 * same by the file system.
 *
 * In case a remote doc was already merged and some just added local doc has an
 * identity that conflicts with the former (race condition), renaming the local
 * doc would still prevent the remote one from being written locally.
 *
 * This is why identity conflicts are always resolved on the remote side.
 */

const metadata = require('./metadata')

/*::
import type { Metadata, SideName } from './metadata'

export opaque type IdConflictInfo = {
  existingDoc: Metadata,
  newDoc: Metadata,
  platform: string,
  sideName: SideName
}
*/

module.exports = {
  description,
  detectOnIdentity
}

const { platform } = process

/** Human readable description of the conflict */
function description ({ sideName, newDoc, existingDoc, platform } /*: IdConflictInfo */) /*: string */ {
  const newPathRepr = JSON.stringify(newDoc.path)
  const existingPathRepr = JSON.stringify(existingDoc.path)
  const idRepr = JSON.stringify(existingDoc._id)
  return (
    `Identity conflict between new ${sideName} ${newDoc.docType} ${newPathRepr} ` +
    `and existing ${existingDoc.docType} ${existingPathRepr}: ` +
    `both would get the same ${idRepr} id on ${platform}.`
  )
}

/** Return IdConflictInfo in case `newDoc` and `existingDoc` cannot coexist
 * on the current platform.
 *
 * The sideName represents the side from which `newDoc` is coming from.
 *
 * The order of the parameters matches the one used in Merge methods.
 *
 * FIXME: sideName and newDoc probably belong to the same data structure
 *        (representing some change to be merged).
 */
function detectOnIdentity (sideName /*: SideName */, newDoc /*: Metadata */, existingDoc /*: ?Metadata */) /*: ?IdConflictInfo */ {
  if (!existingDoc) return // Exit early to make flow happy

  const isIdConflict = (
    newDoc._id === existingDoc._id &&
    newDoc.path !== existingDoc.path &&
    metadata.remoteId(newDoc) !== metadata.remoteId(existingDoc)
  )

  if (isIdConflict) {
    return {
      existingDoc,
      newDoc,
      platform,
      sideName
    }
  }
}
