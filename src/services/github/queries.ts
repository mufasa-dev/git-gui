export const PROFILE_GRAPHQL_QUERY = `
  query($username: String!) {
    user(login: $username) {
      name
      login
      bio
      company
      location
      avatarUrl
      websiteUrl
      twitterUsername
      followers { totalCount }
      following { totalCount }
      status { message emoji }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              color
            }
          }
        }
      }
    }
  }
`;

export const FOLLOWERS_QUERY = `
  query($username: String!, $cursor: String) {
    user(login: $username) {
      followers(first: 50, after: $cursor) {
        nodes {
          login
          name
          avatarUrl
          bio
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const FOLLOWING_QUERY = `
  query($username: String!, $cursor: String) {
    user(login: $username) {
      following(first: 50, after: $cursor) {
        nodes {
          login
          name
          avatarUrl
          bio
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const USER_PULL_REQUESTS_QUERY = `
    query ($username: String!) {
        user(login: $username) {
            pullRequests(first: 20, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
                id
                title
                state
                createdAt
                number
                repository {
                name
                owner { login }
                }
                comments { totalCount }
            }
            pageInfo {
                hasNextPage
                endCursor
            }
          }
      }
    }
  `;

export const REPO_PULL_REQUESTS_QUERY = `
  query ($owner: String!, $name: String!, $states: [PullRequestState!]) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 50, states: $states, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          id
          number
          title
          state
          createdAt
          author { login avatarUrl }
        }
      }
    }
  }
`;

export const PR_DESCRIPTION_QUERY = `
  query ($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        body
        author { login }
        changedFiles
        additions
        deletions
        reviews(first: 10) {
          nodes {
            state
            author { login avatarUrl }
          }
        }
        reviewRequests(first: 10) {
          nodes {
            requestedReviewer {
              ... on User { login avatarUrl }
            }
          }
        }
        participants(first: 10) {
          nodes { login avatarUrl name email }
        }
        reviewRequests(first: 10) {
          nodes {
            requestedReviewer {
              ... on User {
                login
                avatarUrl
              }
            }
          }
        }
        comments(first: 30) {
          totalCount
          nodes {
            author { login }
            body
            createdAt
          }
        }
      }
    }
  }
`;

export const GET_PR_FILES_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        files(first: 100) {
          nodes {
            path
            changeType
            additions
            deletions
          }
        }
      }
    }
  }
`;

export const GET_FILE_CONTENT_QUERY = `
  query($owner: String!, $name: String!, $expression: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expression) {
        ... on Blob {
          text
        }
      }
    }
  }
`;

export const GET_PR_COMMITS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        commits(first: 100) {
          nodes {
            commit {
              oid
              abbreviatedOid
              message
              committedDate
              author {
                name
                avatarUrl
                user {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_PR_CHECKS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: 50) {
                  nodes {
                    ... on CheckRun {
                      id
                      name
                      status
                      conclusion
                      url
                      detailsUrl
                    }
                    ... on StatusContext {
                      id
                      context
                      state
                      targetUrl
                      description
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_PR_TIMELINE_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        id 
        timelineItems(first: 50) {
          nodes {
            __typename
            ... on PullRequestCommit {
              commit {
                oid
                message
                committedDate
                author {
                  name
                  email
                  avatarUrl
                }
              }
            }
            ... on IssueComment {
              id
              author {
                login
                avatarUrl
              }
              bodyHTML
              createdAt
              isMinimized
              minimizedReason
              reactionGroups {
                content
                users {
                  totalCount
                }
                viewerHasReacted
              }
            }
            ... on PullRequestReview {
              id
              author {
                login
                avatarUrl
              }
              state
              createdAt
              isMinimized
              minimizedReason
              reactionGroups {
                content
                users {
                  totalCount
                }
                viewerHasReacted
              }
            }
            ... on MergedEvent {
              actor {
                login
                avatarUrl
              }
              createdAt
            }
          }
        }
      }
    }
  }
`;

export const ADD_PR_COMMENT = `
  mutation ($subjectId: ID!, $body: String!) {
    addComment(input: { subjectId: $subjectId, body: $body }) {
      commentEdge {
        node {
          id
          body
          createdAt
          author { login avatarUrl }
        }
      }
    }
  }
`;

export const DELETE_PR_COMMENT = `
  mutation($id: ID!) {
    deleteIssueComment(input: { id: $id }) {
      clientMutationId
    }
  }
`;

export const HIDE_PR_COMMENT = `
  mutation ($subjectId: ID!, $reason: ReportedContentClassifiers!) {
    minimizeComment(input: { subjectId: $subjectId, classifier: $reason }) {
      minimizedComment {
        isMinimized
        minimizedReason
      }
    }
  }
`;

export const ADD_REACTION = `
  mutation ($subjectId: ID!, $content: ReactionContent!) {
    addReaction(input: { subjectId: $subjectId, content: $content }) {
      reaction {
        content
        user { login }
      }
    }
  }
`;

export const REMOVE_REACTION = `
  mutation ($subjectId: ID!, $content: ReactionContent!) {
    removeReaction(input: { subjectId: $subjectId, content: $content }) {
      reaction {
        content
      }
    }
  }
`;