import { SchemaType } from "@google/generative-ai";
import mongoose, { Document, Schema, Model } from 'mongoose';


export interface InstagramCommentSchema {
    description: string;
    type: SchemaType;
    items: {
        type: SchemaType;
        properties: {
            comment: {
                type: SchemaType;
                description: string;
                nullable: boolean;
            };
            viralRate: {
                type: SchemaType;
                description: string;
                nullable: boolean;
            };
            commentTokenCount: {
                type: SchemaType;
                description: string;
                nullable: boolean;
            };
        };
        required: string[];
    };
}

export const getInstagramCommentSchema = (): InstagramCommentSchema => {
    return {
        description: `Lists comments that are engaging and have the potential to attract more likes and go viral.`,
        type: SchemaType.ARRAY,
        items: {
            type: SchemaType.OBJECT,
            properties: {
                comment: {
                    type: SchemaType.STRING,
                    description: "A comment between 150 and 250 characters.",
                    nullable: false,
                },
                viralRate: {
                    type: SchemaType.NUMBER,
                    description: "The viral rate, measured on a scale of 0 to 100.",
                    nullable: false,
                },
                commentTokenCount: {
                    type: SchemaType.NUMBER,
                    description: "The total number of tokens in the comment.",
                    nullable: false,
                },
            },
            required: [
                "comment",
                "viralRate",
                "commentTokenCount"
            ],
        },
    };
};

// Define the interface for Instagram comments
interface IInstagramComment extends Document {
  postUrl: string;
  comment: string;
  timeCommented: Date;
  linktreeUrl?: string; // Optional linktree URL
}

// Define the schema for the Instagram comment document
const instagramCommentSchema: Schema<IInstagramComment> = new Schema({
  postUrl: { type: String, required: true },
  comment: { type: String, required: true },
  timeCommented: { type: Date, default: Date.now },
  linktreeUrl: { type: String, default: "https://linktr.ee/ffuBiryanifactory" }
});

// Create the model for the Instagram comment document
const InstagramComment: Model<IInstagramComment> = mongoose.model<IInstagramComment>('InstagramComment', instagramCommentSchema);

// Define the interface for followed Instagram accounts
interface IFollowedAccount extends Document {
  username: string;
  followedAt: Date;
  accountType: string; // 'food_blogger' or 'post_author'
}

// Define the schema for followed Instagram accounts
const followedAccountSchema: Schema<IFollowedAccount> = new Schema({
  username: { type: String, required: true, unique: true },
  followedAt: { type: Date, default: Date.now },
  accountType: { type: String, enum: ['food_blogger', 'post_author'], required: true }
});

// Create the model for followed Instagram accounts
const FollowedAccount: Model<IFollowedAccount> = mongoose.model<IFollowedAccount>('FollowedAccount', followedAccountSchema);


// Define the interface for the Tweet document
interface ITweet extends Document {
  tweetContent: string;
  imageUrl: string;
  timeTweeted: Date;
  linktreeUrl?: string; // Optional linktree URL
}

// Define the schema for the Tweet document
const tweetSchema: Schema<ITweet> = new Schema({
  tweetContent: { type: String, required: true },
  imageUrl: { type: String, required: true },
  timeTweeted: { type: Date, default: Date.now },
  linktreeUrl: { type: String, default: "https://linktr.ee/ffuBiryanifactory" }
});

// Create the model for the Tweet document
const Tweet: Model<ITweet> = mongoose.model<ITweet>('Tweet', tweetSchema);

export default Tweet;
export { InstagramComment, FollowedAccount };