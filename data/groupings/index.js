module.exports = [
    {
        "type": "Grouping",
        "optionsName": "test_usa_individual_labels",
        "groupCollection": require('../all_states.json'),
        "label": function (_props) {
            return _props.NAME;
        }
    },

    {
        "type": "Grouping",
        "optionsName": "test_usa_group_label",
        "label": "United States",
        "groupCollection": require('../all_states.json')
    },

    {
        "type": "Grouping",
        "optionsName": "test_roanoke_excluding_inner",
        "label": "Roanoke",
        "groupCollection": require('./roanoke_va.json'),
        "excludeFeatures": function (_props) {
            if(_props.AFFGEOID == '0500000US51161')
                return false;
            else
                return true;
        }
    },

    {
        "type": "Grouping",
        "optionsName": "test_roanoke_including_inner",
        "label": "Roanoke",
        "groupCollection": require('./roanoke_va.json')
    },

    {
        "type": "Grouping",
        "optionsName": "test_roanoke_individual_labels",
        "groupCollection": require('./roanoke_va.json'),
        "label": function (_props) {
            return _props.NAME;
        }
    }
];