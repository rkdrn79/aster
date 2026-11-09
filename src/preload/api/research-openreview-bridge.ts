import { ipcRenderer } from 'electron'
import type { OpenReviewForumReviews } from '../../shared/research/openreview-reviews'

export type ResearchOpenReviewApi = {
  /** Public reviews of an OpenReview forum, fetched by the desktop app. */
  fetchForum: (params: { forum: string }) => Promise<OpenReviewForumReviews>
}

export const researchOpenReviewApi: ResearchOpenReviewApi = {
  fetchForum: (params) => ipcRenderer.invoke('researchOpenReview:fetchForum', params)
}
