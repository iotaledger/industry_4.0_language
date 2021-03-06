const uuid = require('uuid/v4');
const available_operations = require('./catalog/operations.json');
const eClass = require('./catalog/eClass.json');
const callForProposal = require('./templates/callForProposal.json');
const proposal = require('./templates/proposal.json');
const acceptProposal = require('./templates/acceptProposal.json');
const rejectProposal = require('./templates/rejectProposal.json');
const informConfirm = require('./templates/informConfirm.json');
const informPayment = require('./templates/informPayment.json');

/**
 * 1. For CfP message type returns list of operations (plain text)
 */
export const operations = () => {
    return available_operations;
}

/**
 * 1. Performs lookup in the eCl@ss catalog, retrieves submodel  
 * 2. Returns submodel without price property
 */
export const submodel = (irdi) => {
    return eClass[irdi].submodelElements.filter(({ idShort }) => !['preis', 'price'].includes(idShort));
}

/**
 * 1. Evaluates values  
 * 2. Returns success or failure notification
 */
export const evaluate = (irdi, values) => {
    const submodelTemplate = submodel(irdi);
    let status;
    submodelTemplate.some(element => {
        const value = values[element.semanticId];
        if (element.valueType !== 'boolean' && !value) {
            status = `Value for ${element.idShort} (${element.semanticId}) is missing`;
            return null;
        }

        const isTypeValid = checkType(element.valueType, value);
        if (!isTypeValid) {
            status = `Type for ${element.idShort} (${element.semanticId}) is invalid`; 
            return null;
        }
        return null;
    });
    return status || 'success';
}

const checkType = (type, value) => {
    switch (type) {
        case 'string':
        case 'langString':
        case 'anyURI':
            return typeof value === 'string';

        case 'decimal':
        case 'double':
        case 'float':
            return typeof value === 'number';

        case 'int':
        case 'integer':
        case 'long':
        case 'short':
        case 'byte':
        case 'unsignedLong':
        case 'unsignedShort':
        case 'unsignedByte':
            return typeof value === 'number' && Math.abs(value % 1) === 0;
        case 'nonNegativeInteger':
            return typeof value === 'number' && value >= 0 && value % 1 === 0;
        case 'positiveInteger':
        case 'time':
            return typeof value === 'number' && value > 0 && value % 1 === 0;
        case 'nonPositiveInteger':
            return typeof value === 'number' && value <= 0 && value % 1 === 0;
        case 'negativeInteger':
            return typeof value === 'number' && value < 0 && value % 1 === 0;
    
        case 'date':
        case 'dateTime':
        case 'dateTimeStamp':
            return typeof value === 'number' && typeof new Date(value) === 'object';

        case 'boolean':
            return typeof value === 'boolean';
        
        case 'complexType':
            return typeof value === 'object';
        
        case 'anyType':
        case 'anySimpleType':
        case 'anyAtomicType':
        default:
          return true;
    }
}

/**
 * 1. Generates conversationId, messageId,  
 * 2. Fills placeholder JSON for selected message type with provided values, appends submodel  
 * 3. Returns generated message of the selected type (CfP, Proposal, etc.)  
 */
export const generate = ({ 
    messageType, 
    userId, 
    irdi, 
    submodelValues, 
    replyTime, 
    originalMessage = null, 
    price = null,
    location = null,
    startTimestamp = null,
    endTimestamp = null,
    creationDate = null,
    userName = null,
}) => {
    let message = getTemplate(messageType);
    if (!message) {
        return null;
    }
    message.frame.sender.identification.id = userId;
    message.frame.replyBy = getReplyByTime(replyTime);
    message.userName = userName;

    if (originalMessage && messageType !== 'callForProposal') {
        const { dataElements, frame, walletAddress, ...additionalParams } = originalMessage;
        message.frame.conversationId = frame.conversationId;
        message.frame.receiver.identification.id = frame.sender.identification.id;
        message.dataElements = dataElements;
        message.frame.location = frame.location;
        message.frame.startTimestamp = frame.startTimestamp;
        message.frame.endTimestamp = frame.endTimestamp;
        message.frame.creationDate = frame.creationDate;

        if (walletAddress) {
            message.walletAddress = walletAddress;
        }

        if (messageType === 'proposal' && price && irdi) {
            const priceModel = eClass[irdi].submodelElements.find(({ idShort }) => ['preis', 'price'].includes(idShort));
            priceModel.value = price;

            const updatedModel = message.dataElements.submodels[0].identification.submodelElements
                .filter(model => !['preis', 'price'].includes(model.idShort));
            
            updatedModel.push(priceModel);
            message.dataElements.submodels[0].identification.submodelElements = updatedModel;
        }

        // append additional params from earlier messages, like sensor data or DID
        message = { ...message, ...additionalParams };
    } else if (irdi && messageType === 'callForProposal') {
        message.frame.conversationId = uuid();

        if (location) {
            message.frame.location = location;
        }
        
        if (startTimestamp && endTimestamp) {
            message.frame.startTimestamp = startTimestamp;
            message.frame.endTimestamp = endTimestamp;
        }

        if (creationDate) {
            message.frame.creationDate = creationDate;
        }

        if (evaluate(irdi, submodelValues) === 'success') {
            const submodelTemplate = submodel(irdi);
            const submodelElements = submodelTemplate.map(element => (
                { ...element, value: submodelValues[element.semanticId] } 
            ));
            message.dataElements.submodels = [{
                identification: {
                    id: irdi,
                    submodelElements
                }
            }];
        }
    }

    return message;
}

const getReplyByTime = (minutes = 10) => {
    const timestamp = new Date();
    const timeToReply = minutes * 60 * 1000; // 10 minutes in milliseconds
    timestamp.setTime(timestamp.getTime() + timeToReply);
    return Date.parse(timestamp);
}

const getTemplate = (type) => {
    switch (type) {
        case 'callForProposal':
            return callForProposal;
        case 'proposal':
            return proposal;
        case 'acceptProposal':
            return acceptProposal;
        case 'rejectProposal':
            return rejectProposal;        
        case 'informConfirm':
            return informConfirm;
        case 'informPayment':
            return informPayment;
        default:
            return null;
    }
}

// module.exports = {
//     generate,
//     evaluate,
//     operations,
//     submodel
// }
