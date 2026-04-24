import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "../db.js";
import { Campaign } from "./Campaign.js";
import { Recipient } from "./Recipient.js";

export type CampaignRecipientStatus = "pending" | "sent" | "failed";

export class CampaignRecipient extends Model<
  InferAttributes<CampaignRecipient>,
  InferCreationAttributes<CampaignRecipient>
> {
  declare campaign_id: ForeignKey<Campaign["id"]>;
  declare recipient_id: ForeignKey<Recipient["id"]>;
  declare status: CreationOptional<CampaignRecipientStatus>;
  declare sent_at: CreationOptional<Date | null>;
  declare opened_at: CreationOptional<Date | null>;
}

CampaignRecipient.init(
  {
    campaign_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: "campaigns", key: "id" },
      onDelete: "CASCADE",
    },
    recipient_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: "recipients", key: "id" },
      onDelete: "CASCADE",
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: "pending",
      allowNull: false,
      validate: { isIn: [["pending", "sent", "failed"]] },
    },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    opened_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: "campaign_recipients", timestamps: false }
);

Campaign.belongsToMany(Recipient, {
  through: CampaignRecipient,
  foreignKey: "campaign_id",
  otherKey: "recipient_id",
  as: "recipients",
});
Recipient.belongsToMany(Campaign, {
  through: CampaignRecipient,
  foreignKey: "recipient_id",
  otherKey: "campaign_id",
  as: "campaigns",
});
Campaign.hasMany(CampaignRecipient, { foreignKey: "campaign_id", as: "recipientLinks" });
CampaignRecipient.belongsTo(Campaign, { foreignKey: "campaign_id" });
CampaignRecipient.belongsTo(Recipient, { foreignKey: "recipient_id", as: "recipient" });
Recipient.hasMany(CampaignRecipient, { foreignKey: "recipient_id" });
