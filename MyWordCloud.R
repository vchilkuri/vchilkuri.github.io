install.packages("twitteR")
install.packages("ROAuth")
library("twitteR")
library("ROAuth")
#Setup a twitter OAuth
consumer_key = "ft4D2rEy5Ef4cAXHBl8ItvvTj"
consumer_secret = "iIdpT6fFLob7TGJZ0rq0ZihFpwz3utL176NumbAZr1yaffXXll"
access_token = "2226339703-jN72VtjBomCcbUNwS78DV58YkIDPmop9hkvtYR5"
access_secret = "xSejnFaylRBQmMltzVbN0u3PJgT7wxgmPJitZki59VaAB"
# This step gives direct authentication to the twitter app
setup_twitter_oauth(consumer_key,consumer_secret,access_token,access_secret)
search.string <- "#pawankalyan" # Enter your string here
no.of.tweets <- 1500 # Number of tweets reqd.
tweets <- searchTwitter(search.string,n=no.of.tweets,lang="en")
tweets

#Extraction of tweets done

# Creating a word-cloud
tweets.text <- sapply(tweets, function(x) x$getText())

# Clean up begins
# To remove all the emojis and encoded characters
tweets$text <- sapply(tweets$text,function(row) iconv(row, "latin1", "ASCII", sub=""))
#convert all text to lower case
tweets.text <- tolower(tweets.text)

# Replace blank space ("rt")
tweets.text <- gsub("rt", "", tweets.text)

# Replace @UserName
tweets.text <- gsub("@\\w+", "", tweets.text)

# Remove punctuation
tweets.text <- gsub("[[:punct:]]", "", tweets.text)

# Remove links
tweets.text <- gsub("http\\w+", "", tweets.text)

# Remove tabs
tweets.text <- gsub("[ |\t]{2,}", "", tweets.text)

# Remove blank spaces at the beginning
tweets.text <- gsub("^ ", "", tweets.text)

# Remove blank spaces at the end
tweets.text <- gsub(" $", "", tweets.text)

#install tm - if not already installed
install.packages("tm")
library("tm")

#create corpus
tweets.text.corpus <- Corpus(VectorSource(tweets.text))

#clean up by removing stop words
tweets.text.corpus <- tm_map(tweets.text.corpus, function(x)removeWords(x,stopwords()))

#install wordcloud if not already installed
install.packages("wordcloud")
library("wordcloud")

#generate wordcloud
wordcloud(tweets.text.corpus,min.freq = 2, scale=c(8,1.0),colors=brewer.pal(8, "Dark2"),  random.color= TRUE, random.order = FALSE, max.words = 150)