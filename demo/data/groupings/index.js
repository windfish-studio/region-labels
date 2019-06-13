module.exports = [
    {
        "type": "Grouping",
        "groupName": "test_usa_individual_labels",
        "geojson": require('../all_states.json'),
        "opts": {
            "label": function (_props) {
                return _props.NAME;
            }
        }

    },

    {
        "type": "Grouping",
        "groupName": "test_usa_dbscan_labels",
        "geojson": require('./us_border.json'),
        "opts": {
            "label": "United States",
            "dbscanClustering": true
        }

    },

    {
        "type": "Grouping",
        "groupName": "test_usa_group_label",
        "geojson": require('../all_states.json'),
        "opts": {
            "label": "United States",
            "forceSingleLabel": true
        }
    },

    {
        "type": "Grouping",
        "groupName": "test_roanoke_excluding_inner",
        "geojson": require('./roanoke_va.json'),
        "opts": {
            "label": "Roanoke",
            "forceSingleLabel": true,
            "excludeFeatures": function (_props) {
                if(_props.AFFGEOID == '0500000US51161')
                    return false;
                else
                    return true;
            }
        }
    },

    {
        "type": "Grouping",
        "groupName": "test_roanoke_including_inner",
        "geojson": require('./roanoke_va.json'),
        "opts": {
            "label": "Roanoke",
            "forceSingleLabel": true
        }
    },

    {
        "type": "Grouping",
        "groupName": "test_roanoke_individual_labels",
        "geojson": require('./roanoke_va.json'),
        "opts": {
            "label": function (_props) {
                return _props.NAME;
            }
        }
    }
];