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